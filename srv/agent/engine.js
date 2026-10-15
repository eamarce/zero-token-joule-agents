import cds from '@sap/cds';
import { profile } from './config.js';
import { answerOf, checkOrder, sameAnswer } from './check.js';
import { createModel, textOf } from './models.js';
import { createTools } from './tools.js';
import { explore } from './graph.js';
import { activePlaybook, afterRun, recordFrozenRun, recordPlaybookRun } from './crystallizer.js';
import { loadExtractor } from '../lib/sandbox.js';
import { classifyRun } from '../lib/classify.js';
import { computeRatio } from './ratio.js';

const { SELECT, INSERT, UPDATE } = cds.ql;

const describe = (a) => (a ? `${a.order_no} ${a.order_date} ${a.total} ${a.currency}` : 'nothing');

function runCode(source, email) {
  try {
    return { fields: loadExtractor(source)({ from: email.from, subject: email.subject, body: email.body }) };
  } catch (e) {
    return { fields: null, error: e.message };
  }
}

async function writeOrder(tools, email, fields) {
  const supplier = await tools.call('lookup_supplier', { email_domain: email.from.split('@')[1] });
  await tools.call('write_order', { supplier_id: supplier.supplier_id, ...answerOf(fields), source_message_id: email.message_id });
  return supplier;
}

/** Type 3: the LangGraph agent explores. */
async function runExplore(ctx) {
  const tools = createTools(ctx.runId);
  const messages = await explore(ctx.model, tools.forModel, ctx.messageId);
  for (const m of messages.filter((x) => x.type === 'ai')) {
    ctx.modelCalls.push({ purpose: 'explore', input: m.usage_metadata?.input_tokens ?? 0, output: m.usage_metadata?.output_tokens ?? 0 });
  }
  const ok = (name) => tools.calls.some((c) => c.name === name && !c.error);
  ctx.calls.push(...tools.calls);
  ctx.path = tools.calls.map((c) => c.name).join('>');
  ctx.task = ok('write_order') ? 'parse_order_email' : ok('draft_reply') ? 'reply_to_supplier' : 'unknown';
  ctx.status = ok('write_order') || ok('draft_reply') ? 'clean' : 'failed';
  ctx.summary = textOf(messages.findLast((x) => x.type === 'ai')) || 'the agent stopped without a summary';
}

/** Type 2: the playbook runs the steps; the model only reads the fields; the candidate code runs in its shadow. */
async function runPlaybook(ctx, pb) {
  const tools = createTools(ctx.runId);
  const email = await tools.call('read_email', { message_id: ctx.messageId });
  const { fields, usage } = await ctx.model.interpret(email);
  ctx.modelCalls.push({ purpose: 'interpret', ...usage });
  const problems = checkOrder(fields);
  if (problems.length) {
    ctx.calls.push(...tools.calls);
    return { fallback: `the model's reading failed the output check (${problems.join('; ')})` };
  }
  const shadow = runCode(pb.extractor_source, email);
  const shadowMatch = sameAnswer(shadow.fields, fields);
  const supplier = await writeOrder(tools, email, fields);
  ctx.calls.push(...tools.calls);
  ctx.path = tools.calls.map((c) => c.name).join('>');
  ctx.task = pb.task;
  ctx.status = 'clean';
  ctx.shadowMatch = shadowMatch;
  ctx.summary = `Order ${fields.order_no} written for ${supplier.name} by playbook v${pb.version}; the model read the fields.`;
  ctx.events.push(...(await recordPlaybookRun(pb, { clean: true, shadowMatch, runSeq: ctx.seq, detail: shadowMatch ? null : `code said ${describe(answerOf(shadow.fields))}, model said ${describe(answerOf(fields))}` })));
}

/** Type 1: the signed code runs with no model, except on re-check runs. */
async function runFrozen(ctx, pb) {
  const tools = createTools(ctx.runId);
  const email = await tools.call('read_email', { message_id: ctx.messageId });
  const code = runCode(pb.extractor_source, email);
  const problems = code.error ? [code.error] : checkOrder(code.fields);
  if (problems.length) {
    ctx.calls.push(...tools.calls);
    return { fallback: `the frozen code's answer failed the output check (${problems.join('; ')})` };
  }
  const p = profile();
  const recheck = ((pb.frozen_runs ?? 0) + 1) % p.recheck_every === 0;
  let fields = code.fields;
  let agreed = true;
  if (recheck) {
    const ref = await ctx.model.interpret(email);
    ctx.modelCalls.push({ purpose: 'recheck', ...ref.usage });
    agreed = sameAnswer(code.fields, ref.fields);
    if (!agreed && checkOrder(ref.fields).length === 0) fields = ref.fields;
  }
  const supplier = await writeOrder(tools, email, fields);
  ctx.calls.push(...tools.calls);
  ctx.path = tools.calls.map((c) => c.name).join('>');
  ctx.task = pb.task;
  ctx.status = 'clean';
  ctx.route = recheck ? 'recheck' : 'frozen';
  const detail = agreed ? null : `code said ${describe(answerOf(code.fields))}, model said ${describe(answerOf(fields))}`;
  ctx.summary = recheck
    ? `Order ${fields.order_no} written for ${supplier.name}. Re-check run: ${agreed ? 'the model agreed with the code' : `the model disagreed (${detail}); its answer was used`}.`
    : `Order ${fields.order_no} written for ${supplier.name} by signed code v${pb.version}, no model call.`;
  ctx.events.push(...(await recordFrozenRun(pb, { recheck, agreed, runSeq: ctx.seq, detail })));
}

/**
 * Process one email: pick the route, run it, record everything, then let the
 * crystallizer look at the history. The route depends only on the supplier
 * (the sender's domain) and on the playbook's status, never on the model.
 */
export async function processMessage(messageId) {
  const email = await SELECT.one.from('zt.Emails').where({ ID: messageId });
  if (!email) throw Object.assign(new Error(`no email with id ${messageId}`), { status: 404 });

  const model = await createModel();
  const last = await SELECT.one.from('zt.Runs').columns('max(seq) as seq');
  const seq = (last?.seq ?? 0) + 1;
  const ctx = {
    model,
    seq,
    runId: `run-${String(seq).padStart(4, '0')}`,
    messageId,
    subjectKey: email.sender.split('@')[1],
    calls: [],
    modelCalls: [],
    events: [],
    route: 'explore',
    shadowMatch: null,
    note: null,
  };
  const startedAt = new Date().toISOString();

  const pb = await activePlaybook(ctx.subjectKey);
  let fallback = null;
  if (pb?.status === 'frozen') {
    ctx.route = 'frozen';
    fallback = (await runFrozen(ctx, pb))?.fallback;
  } else if (pb) {
    ctx.route = 'playbook';
    fallback = (await runPlaybook(ctx, pb))?.fallback;
  }
  if (!pb || fallback) {
    const attempted = ctx.calls.length;
    if (fallback) {
      ctx.route = 'fallback';
      ctx.note = `fallback to the model: ${fallback}`;
      ctx.events.push(`${pb.subject_key} v${pb.version} handed ${messageId} back to the model: ${fallback}`);
    }
    await runExplore(ctx);
    // The path of a fallback run is the explore part only, so it can count toward a new proposal.
    ctx.path = ctx.calls.slice(attempted).map((c) => c.name).join('>');
  }

  const tokens = {
    input: ctx.modelCalls.reduce((a, c) => a + (c.input ?? 0), 0),
    output: ctx.modelCalls.reduce((a, c) => a + (c.output ?? 0), 0),
  };
  const usedPlaybook = ['playbook', 'frozen', 'recheck'].includes(ctx.route) ? pb : null;
  const runType = classifyRun({ tokens, playbook_id: usedPlaybook?.ID ?? null });

  // Synthetic oracle: the mailbox knows the right answer. A real system does not.
  const expected = JSON.parse(email.expected_json ?? '{}');
  const written = ctx.calls.findLast((c) => c.name === 'write_order' && !c.error)?.input;
  let wrong = false;
  if (ctx.status === 'clean') wrong = expected.task !== ctx.task || (ctx.task === 'parse_order_email' && !sameAnswer(written, expected));

  const output = written ? answerOf(written) : ctx.calls.findLast((c) => c.name === 'draft_reply' && !c.error)?.input ?? null;
  const run = {
    ID: ctx.runId,
    seq,
    message_id: messageId,
    task: ctx.task,
    subject_key: ctx.subjectKey,
    route: ctx.route,
    run_type: runType,
    path: ctx.path,
    playbook_ID: usedPlaybook?.ID ?? null,
    playbook_version: usedPlaybook?.version ?? null,
    tokens_input: tokens.input,
    tokens_output: tokens.output,
    model_calls: ctx.modelCalls.length,
    tokens_estimated: model.estimated,
    model: ctx.modelCalls.length ? model.model : null,
    status: ctx.status,
    shadow_match: ctx.shadowMatch,
    wrong,
    note: ctx.note,
    output_json: output ? JSON.stringify(output) : null,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    tool_calls: ctx.calls.map((c, i) => ({
      seq: i + 1,
      name: c.name,
      input_json: JSON.stringify(c.input),
      output_json: c.output == null ? null : JSON.stringify(c.output),
      error: c.error,
      duration_ms: c.duration_ms,
    })),
  };
  await INSERT.into('zt.Runs').entries(run);
  if (ctx.modelCalls.length) {
    await INSERT.into('zt.ModelCalls').entries(
      ctx.modelCalls.map((c) => ({
        ID: cds.utils.uuid(),
        run_ID: run.ID,
        purpose: c.purpose,
        model: model.model,
        tokens_input: c.input ?? 0,
        tokens_output: c.output ?? 0,
        estimated: model.estimated,
        at: run.finished_at,
      })),
    );
  }
  await UPDATE('zt.Emails', messageId).with({ processed: true });

  ctx.events.push(...(await afterRun(run, model)));
  const ratio = await computeRatio();
  return {
    runId: run.ID,
    messageId,
    task: run.task,
    route: run.route,
    runType,
    tokens: tokens.input + tokens.output,
    estimated: model.estimated,
    status: run.status,
    summary: ctx.summary,
    note: run.note,
    events: ctx.events,
    ratio: ratio.ratio,
  };
}

export async function processNext() {
  const next = await SELECT.one.from('zt.Emails').columns('ID').where({ processed: false }).orderBy('seq');
  if (!next) throw Object.assign(new Error('the mailbox is empty: every email has been processed. Call reset() to start again.'), { status: 409 });
  return processMessage(next.ID);
}

import cds from '@sap/cds';
import { CONTRACTS, profile } from './config.js';
import { answerOf, sameAnswer } from './check.js';
import { backtest } from '../lib/backtest.js';

const { SELECT, INSERT, UPDATE } = cds.ql;

/** Statuses in which a playbook handles its cases instead of the explore agent. */
export const ACTIVE = ['playbook', 'eligible', 'frozen'];

/** Routes where the model, not frozen code, produced the answer. */
const MODEL_ANSWERED = ['explore', 'fallback', 'playbook', 'recheck'];

// A signature has to come from a person. These prefixes are agents, services
// and client-credentials users (XSUAA client ids start with "sb-"). It is a
// guard against a mistake, not an identity check.
const NOT_A_PERSON = /^(agent|model|system|bot|joule|llm|auto|service|ci|client)\b|^sb-/i;

const now = () => new Date().toISOString();
const label = (pb) => `${pb.subject_key} v${pb.version}`;

export async function activePlaybook(subjectKey) {
  return SELECT.one.from('zt.Playbooks').where({ subject_key: subjectKey, status: { in: ACTIVE } }).orderBy('version desc');
}

async function decide(pb, action, actor, toStatus, rationale, details) {
  await INSERT.into('zt.Decisions').entries({
    ID: cds.utils.uuid(),
    playbook_ID: pb.ID,
    action,
    actor,
    from_status: pb.status,
    to_status: toStatus,
    rationale,
    details_json: details ? JSON.stringify(details) : null,
    at: now(),
  });
  if (toStatus !== pb.status) {
    await UPDATE('zt.Playbooks', pb.ID).with({ status: toStatus });
    pb.status = toStatus;
  }
}

/**
 * Past cases the model answered for one supplier template: the email as input,
 * the order the model wrote as the expected answer. These feed both the prompt
 * that asks for code and the backtest that checks the code.
 */
async function modelCases(subjectKey, task) {
  const contract = CONTRACTS[task];
  const runs = await SELECT.from('zt.Runs')
    .columns('ID', 'seq', 'route', { ref: ['tool_calls'], expand: ['*'] })
    .where({ subject_key: subjectKey, task, status: 'clean', route: { in: MODEL_ANSWERED } })
    .orderBy('seq');
  const cases = [];
  for (const r of runs) {
    const calls = [...r.tool_calls].sort((a, b) => a.seq - b.seq);
    const read = calls.find((c) => c.name === contract.from && !c.error);
    const wrote = calls.findLast((c) => c.name === contract.to && !c.error);
    if (!read || !wrote) continue;
    const email = JSON.parse(read.output_json);
    cases.push({
      run_id: r.ID,
      input: { from: email.from, subject: email.subject, body: email.body },
      expected: answerOf(JSON.parse(wrote.input_json), task),
    });
  }
  return cases;
}

/**
 * After every run: has this supplier's order path repeated often enough, and
 * cleanly enough, to ask the model for code? If so, propose, backtest, and
 * apply gate 1. Returns human-readable events.
 */
export async function afterRun(run, model) {
  const contract = CONTRACTS[run.task];
  if (!contract || run.status !== 'clean') return [];
  if (await activePlaybook(run.subject_key)) return [];

  const p = profile();
  const last = await SELECT.one.from('zt.Playbooks').where({ subject_key: run.subject_key }).orderBy('version desc');
  const since = last?.closed_at_seq ?? 0;
  // Runs where the model produced the answer (not the frozen code), since the
  // last version was closed. After a demotion these include the cases the old
  // code got wrong, which is what the next version has to learn from.
  const recent = await SELECT.from('zt.Runs')
    .where({ subject_key: run.subject_key, task: run.task, route: { in: MODEL_ANSWERED }, seq: { '>': since } })
    .orderBy('seq desc')
    .limit(p.propose_after);

  if (recent.length < p.propose_after) {
    return [`${run.subject_key}: ${recent.length} of ${p.propose_after} runs on this path before the agent may propose a playbook`];
  }
  if (!recent.every((r) => r.status === 'clean' && r.path === recent[0].path)) {
    return [`${run.subject_key}: the last ${p.propose_after} runs did not all take the same path cleanly; no proposal yet`];
  }

  const pool = await modelCases(run.subject_key, run.task);
  const examples = pool.slice(-8);
  const { source, usage } = await model.writeExtractor(examples);
  const version = (last?.version ?? 0) + 1;
  const pb = {
    ID: cds.utils.uuid(),
    name: `${run.task} · ${run.subject_key} · v${version}`,
    task: run.task,
    subject_key: run.subject_key,
    version,
    status: 'proposed',
    steps: recent[0].path,
    extractor_source: source,
    proposed_from: examples.length,
    streak: 0,
    streak_needed: p.gate2_streak,
    max_disagreements: p.max_disagreements,
    created_at: now(),
  };
  await INSERT.into('zt.Playbooks').entries(pb);
  await INSERT.into('zt.ModelCalls').entries({
    ID: cds.utils.uuid(),
    playbook_ID: pb.ID,
    purpose: 'propose',
    model: model.model,
    tokens_input: usage.input,
    tokens_output: usage.output,
    estimated: model.estimated,
    at: now(),
  });
  await decide(pb, 'propose', 'system:crystallizer', 'proposed', `same path ${p.propose_after} times in a row: ${pb.steps}; asked the model for an extractor from ${examples.length} past runs`);
  const events = [`proposed ${label(pb)}: the model wrote a candidate extractor from ${examples.length} past runs (${usage.input + usage.output} tokens, logged outside any run)`];

  if (!source) {
    await UPDATE('zt.Playbooks', pb.ID).with({ closed_at_seq: run.seq });
    await decide(pb, 'reject', 'system:crystallizer', 'rejected', 'the model did not return usable code');
    return [...events, `rejected ${label(pb)}: no usable code; the case stays with the model`];
  }

  const bt = backtest(source, pool, { same: (a, b) => sameAnswer(a, b), minCases: p.propose_after });
  await UPDATE('zt.Playbooks', pb.ID).with({
    backtest_compared: bt.compared,
    backtest_matched: bt.matched,
    backtest_json: JSON.stringify(bt),
  });
  if (bt.verdict !== 'pass') {
    await UPDATE('zt.Playbooks', pb.ID).with({ closed_at_seq: run.seq });
    await decide(pb, 'backtest', 'system:backtest', 'rejected', bt.reasons.join('; '), { mismatches: bt.mismatches.slice(0, 5) });
    return [...events, `backtest failed for ${label(pb)}: ${bt.reasons.join('; ')}. Back to the model.`];
  }
  await decide(pb, 'gate1', 'system:gate1', 'playbook', `backtest matched ${bt.matched} of ${bt.compared} past runs`);
  return [
    ...events,
    `backtest passed: ${bt.matched} of ${bt.compared} past runs match`,
    `gate 1: ${label(pb)} now runs the steps; the model only reads the fields (Type 2) and the code runs in its shadow`,
  ];
}

/** Close a version after repeated disagreements. A new proposal may use the model's answers from the first disagreement on. */
async function retire(pb, failures, firstFailureSeq, actor, rationale) {
  await UPDATE('zt.Playbooks', pb.ID).with({ closed_at_seq: firstFailureSeq - 1 });
  await decide(pb, 'demote', actor, 'demoted', `${failures} ${rationale}`);
  return `${label(pb)} demoted after ${failures} ${rationale}: its cases go back to the model, and the next proposal will learn from the cases this version got wrong`;
}

/** Type 2 evidence for gate 2: clean runs in a row where the shadow code agreed with the model. */
export async function recordPlaybookRun(pb, { clean, shadowMatch, detail, runSeq }) {
  const streak = clean && shadowMatch ? (pb.streak ?? 0) + 1 : 0;
  const shadow_failures = (pb.shadow_failures ?? 0) + (shadowMatch ? 0 : 1);
  const first_failure_seq = pb.first_failure_seq ?? (shadowMatch ? null : runSeq);
  await UPDATE('zt.Playbooks', pb.ID).with({ streak, shadow_failures, first_failure_seq });
  const events = [];
  if (!shadowMatch) events.push(`${label(pb)}: the candidate code disagreed with the model${detail ? ` (${detail})` : ''}; streak reset to 0 (${shadow_failures}/${pb.max_disagreements} disagreements)`);
  else events.push(`${label(pb)}: code agreed with the model, streak ${streak} of ${pb.streak_needed}`);
  if (shadow_failures >= pb.max_disagreements) {
    events.push(await retire(pb, shadow_failures, first_failure_seq, 'system:shadow', 'shadow disagreements before anyone signed'));
    return events;
  }
  if (pb.status === 'eligible' && streak === 0) {
    await decide(pb, 'gate2', 'system:gate2', 'playbook', 'the evidence for gate 2 broke before anyone signed; the streak starts again');
    events.push(`${label(pb)} is no longer eligible: the code disagreed before anyone signed`);
  }
  if (pb.status === 'playbook' && streak >= pb.streak_needed) {
    await decide({ ...pb, streak }, 'eligible', 'system:gate2', 'eligible', `${streak} clean runs in a row with the code agreeing`);
    events.push(`${label(pb)} is eligible for gate 2: a named person must sign before it runs with no model`);
  }
  return events;
}

/** Type 1 bookkeeping: count frozen runs, record re-checks, demote after too many disagreements. */
export async function recordFrozenRun(pb, { recheck, agreed, runSeq, detail }) {
  const frozen_runs = (pb.frozen_runs ?? 0) + 1;
  const rechecks = (pb.rechecks ?? 0) + (recheck ? 1 : 0);
  const failed = recheck && !agreed;
  const recheck_failures = (pb.recheck_failures ?? 0) + (failed ? 1 : 0);
  const first_failure_seq = pb.first_failure_seq ?? (failed ? runSeq : null);
  await UPDATE('zt.Playbooks', pb.ID).with({ frozen_runs, rechecks, recheck_failures, first_failure_seq });
  const events = [];
  if (recheck) {
    await decide(pb, 'recheck', 'system:guard', pb.status, agreed ? 're-check agreed' : `re-check disagreed${detail ? `: ${detail}` : ''}`);
    events.push(agreed ? `${label(pb)}: re-check passed` : `${label(pb)}: re-check FAILED (${recheck_failures}/${pb.max_disagreements}), the model's answer was used`);
  }
  if (recheck_failures >= pb.max_disagreements) {
    events.push(await retire(pb, recheck_failures, first_failure_seq, 'system:guard', 'failed re-checks'));
  }
  return events;
}

/** Gate 2: a named person signs an eligible playbook. */
export async function sign(playbookId, userId, statement) {
  const pb = await SELECT.one.from('zt.Playbooks').where({ ID: playbookId });
  if (!pb) throw Object.assign(new Error('no such playbook'), { status: 404 });
  if (pb.status !== 'eligible') {
    throw Object.assign(new Error(`only an eligible playbook can be signed; this one is ${pb.status} (streak ${pb.streak} of ${pb.streak_needed})`), { status: 409 });
  }
  if (!userId || NOT_A_PERSON.test(userId)) {
    throw Object.assign(new Error(`"${userId}" is not a named person; an agent or a technical user cannot sign`), { status: 403 });
  }
  const signed_at = now();
  await UPDATE('zt.Playbooks', pb.ID).with({ signed_by: userId, signed_at, signature_statement: statement ?? null });
  await decide(pb, 'sign', userId, 'frozen', statement || 'signed');
  return `${label(pb)} signed by ${userId}. It now runs with no model (Type 1), re-checked every ${profile().recheck_every}th run.`;
}

export async function reject(playbookId, userId, rationale) {
  const pb = await SELECT.one.from('zt.Playbooks').where({ ID: playbookId });
  if (!pb) throw Object.assign(new Error('no such playbook'), { status: 404 });
  if (!['proposed', ...ACTIVE].includes(pb.status)) throw Object.assign(new Error(`playbook is already ${pb.status}`), { status: 409 });
  const lastRun = await SELECT.one.from('zt.Runs').columns('max(seq) as seq');
  await UPDATE('zt.Playbooks', pb.ID).with({ closed_at_seq: lastRun?.seq ?? 0 });
  await decide(pb, 'reject', userId, 'rejected', rationale || 'rejected by a person');
  return `${label(pb)} rejected by ${userId}. Its cases go back to the model.`;
}

#!/usr/bin/env node
// Drive the running agent from a terminal (or from a coding agent).
//
//   npm run ctl -- <command> [args]
//
// The server must be running (npm start). Settings:
//   ZT_URL   default http://localhost:4004
//   ZT_USER  default alice:alice   (a person with the Approver role in development)
//
// Add --json to any command for machine-readable output.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { renderReport } from './report.js';

const BASE = (process.env.ZT_URL ?? 'http://localhost:4004').replace(/\/$/, '');
const USER = process.env.ZT_USER ?? 'alice:alice';
const AGENT = `${BASE}/odata/v4/agent`;
const CALC = `${BASE}/odata/v4/calculator`;

// --name value  or  --name (boolean). Everything else is positional.
const flags = {};
const positional = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const v = process.argv[i + 1];
    if (v === undefined || v.startsWith('--')) flags[a.slice(2)] = true;
    else {
      flags[a.slice(2)] = v;
      i++;
    }
  } else positional.push(a);
}
const flag = (name) => flags[name];
const asJson = flag('json') === true;
const asUser = flag('as');
const [command = 'help', ...rest] = positional;

async function call(method, url, body, user = asUser ?? USER) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { authorization: `Basic ${Buffer.from(user).toString('base64')}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`cannot reach ${BASE}. Is the server running? Start it with: npm start`);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error?.message ?? `${res.status} ${res.statusText}`);
  return data;
}

const get = (path) => call('GET', `${AGENT}/${path}`);
const value = (d) => (d && 'value' in d ? d.value : d);
const n = (x) => Number(x ?? 0).toLocaleString('en-US');
const pad = (s, w) => String(s ?? '').padEnd(w);
const out = (data, text) => console.log(asJson ? JSON.stringify(data, null, 2) : text);

function runLine(r) {
  const tok = r.tokens === 0 ? '0 tokens' : `${n(r.tokens)} tok${r.estimated ? ' (est.)' : ''}`;
  const lines = [`${pad(r.runId, 9)} ${pad(r.messageId, 9)} Type ${r.runType}  ${pad(r.route, 9)} ${pad(tok, 18)} ${r.summary}`];
  if (r.note) lines.push(`          note: ${r.note}`);
  for (const e of r.events ?? []) lines.push(`          · ${e}`);
  lines.push(`          Type 1 : 2 : 3 = ${r.ratio}`);
  return lines.join('\n');
}

async function findPlaybook(ref) {
  const pbs = value(await get('Playbooks?$orderby=created_at'));
  if (!pbs.length) throw new Error('no playbooks yet');
  if (!ref) return pbs.find((p) => p.status === 'eligible') ?? pbs.at(-1);
  const hit = pbs.filter((p) => p.ID.startsWith(ref) || p.name.includes(ref) || `v${p.version}` === ref);
  if (hit.length !== 1) throw new Error(hit.length ? `"${ref}" matches ${hit.length} playbooks; use more of the id` : `no playbook matches "${ref}"`);
  return hit[0];
}

const commands = {
  async next() {
    const count = Number(rest[0] ?? 1);
    const results = [];
    for (let i = 0; i < count; i++) {
      let r;
      try {
        r = await call('POST', `${AGENT}/processNext`, {});
      } catch (e) {
        if (!/mailbox is empty/.test(e.message) || i === 0) throw e;
        if (!asJson) console.log('\nThe mailbox is empty. npm run ctl -- reset starts again.');
        break;
      }
      results.push(r);
      if (!asJson) console.log(runLine(r));
      if (!asJson && (r.events ?? []).some((e) => e.includes('eligible for gate 2')) && i < count - 1) {
        console.log('\nStopped: a playbook is waiting for a signature. Review it (npm run ctl -- show) and sign it (npm run ctl -- sign) or keep going.');
        break;
      }
    }
    if (asJson) out(results);
  },

  async process() {
    if (!rest[0]) throw new Error('usage: process <msg-id>');
    const r = await call('POST', `${AGENT}/process`, { messageId: rest[0] });
    out(r, runLine(r));
  },

  async status() {
    const s = JSON.parse(value(await get('status()')));
    if (asJson) return out(s);
    console.log(`model:    ${s.model.provider}${s.model.model ? ` ${s.model.model}` : ''}${s.model.tokens_estimated ? ' (tokens are estimates)' : ''}`);
    console.log(`profile:  ${s.profile.name} (propose after ${s.profile.propose_after}, gate 2 after ${s.profile.gate2_streak} more, re-check every ${s.profile.recheck_every}, demote after ${s.profile.max_disagreements} failed re-checks)`);
    console.log(`mailbox:  ${s.mailbox.unprocessed} of ${s.mailbox.total} unread${s.mailbox.next ? `, next ${s.mailbox.next.ID} from ${s.mailbox.next.sender}: "${s.mailbox.next.subject}"` : ''}`);
    console.log(`ratio:    Type 1 : 2 : 3 = ${s.ratio.ratio} over ${s.ratio.total} runs`);
    for (const p of s.playbooks) {
      console.log(`playbook: ${pad(p.ID.slice(0, 8), 9)} ${pad(`${p.subject_key} v${p.version}`, 30)} ${pad(p.status, 9)} streak ${p.streak}/${p.streak_needed}, frozen runs ${p.frozen_runs}, failed re-checks ${p.recheck_failures}${p.signed_by ? `, signed by ${p.signed_by}` : ''}`);
    }
  },

  async ratio() {
    const r = await get('ratio()');
    if (asJson) return out(r);
    const width = 40;
    console.log(`Type 1 : 2 : 3 = ${r.ratio}   (${r.total} runs, ${n(r.allTokens)} tokens in runs${r.model === 'simulated' ? ', estimated' : ''})\n`);
    for (const row of r.rows) {
      const bar = '█'.repeat(Math.round(row.share * width)).padEnd(width, '·');
      console.log(`Type ${row.type}  ${bar}  ${pad(`${row.pct}%`, 5)} ${pad(`${row.runs} runs`, 9)} ${n(row.tokens)} tokens (${Math.round(row.tokenShare * 100)}%), mean ${n(row.meanTokens)}/run`);
    }
    console.log(`\nWriting candidate code cost ${n(r.proposalTokens)} tokens outside any run.`);
    console.log(`Wrong answers served (known only because the mailbox is synthetic): ${r.wrongServed}`);
  },

  async runs() {
    const last = Number(flag('last') ?? rest[0] ?? 15);
    const rows = value(await get(`Runs?$orderby=seq desc&$top=${last}`)).reverse();
    if (asJson) return out(rows);
    for (const r of rows) {
      const tok = r.tokens_input + r.tokens_output;
      console.log(`${pad(r.ID, 9)} ${pad(r.message_id, 9)} Type ${r.run_type}  ${pad(r.route, 9)} ${pad(r.task, 18)} ${pad(tok ? n(tok) : '0', 7)} ${r.status}${r.wrong ? '  WRONG' : ''}${r.shadow_match === false ? '  code disagreed' : ''}`);
    }
  },

  async playbooks() {
    const rows = value(await get('Playbooks?$orderby=created_at'));
    if (asJson) return out(rows);
    if (!rows.length) return console.log('No playbooks yet. Process a few emails first: npm run ctl -- next 3');
    for (const p of rows) {
      console.log(`${pad(p.ID.slice(0, 8), 9)} ${pad(p.name, 52)} ${pad(p.status, 9)} backtest ${p.backtest_matched ?? '-'}/${p.backtest_compared ?? '-'}, streak ${p.streak}/${p.streak_needed}${p.signed_by ? `, signed by ${p.signed_by}` : ''}`);
    }
  },

  async show() {
    const p = await findPlaybook(rest[0]);
    const decisions = value(await get(`Decisions?$filter=playbook_ID eq ${p.ID}&$orderby=at`));
    if (asJson) return out({ ...p, decisions });
    const bt = p.backtest_json ? JSON.parse(p.backtest_json) : null;
    console.log(`${p.name}  [${p.status}]  id ${p.ID}`);
    console.log(`steps: ${p.steps}`);
    console.log(`backtest: ${bt ? `${bt.matched} of ${bt.compared} past runs match (${bt.verdict})` : 'not run'}`);
    if (bt?.mismatches?.length) for (const m of bt.mismatches.slice(0, 3)) console.log(`  mismatch ${m.run_id}: expected ${JSON.stringify(m.expected)}, got ${JSON.stringify(m.actual)}`);
    console.log(`gate 2 evidence: ${p.streak} of ${p.streak_needed} clean runs in a row with the code agreeing`);
    console.log('\n--- candidate code (written by the model, runs only in the sandbox) ---');
    console.log(p.extractor_source ?? '(none)');
    console.log('--- decisions ---');
    for (const d of decisions) console.log(`${d.at}  ${pad(d.action, 9)} ${pad(d.actor, 20)} ${pad(`${d.from_status} -> ${d.to_status}`, 22)} ${d.rationale ?? ''}`);
  },

  async sign() {
    const p = await findPlaybook(rest[0]);
    const statement = flag('statement') ?? rest[1] ?? 'I reviewed the code, the backtest and the shadow runs.';
    const msg = await call('POST', `${AGENT}/sign`, { playbook: p.ID, statement });
    out({ message: value(msg) }, value(msg));
  },

  async reject() {
    const p = await findPlaybook(rest[0]);
    const msg = await call('POST', `${AGENT}/rejectPlaybook`, { playbook: p.ID, rationale: flag('reason') ?? rest[1] ?? 'rejected from the command line' });
    out({ message: value(msg) }, value(msg));
  },

  async reset() {
    const msg = await call('POST', `${AGENT}/reset`, {});
    out({ message: value(msg) }, value(msg));
  },

  async export() {
    const jsonl = value(await get('exportRunLog()'));
    const file = rest[0];
    if (file) {
      writeFileSync(file, `${jsonl}\n`);
      console.log(`wrote ${jsonl.split('\n').length} runs to ${file}`);
    } else console.log(jsonl);
  },

  async analyze() {
    const file = rest[0];
    const content = file ? readFileSync(file, 'utf8') : value(await get('exportRunLog()'));
    // The thresholds of the four questions can be changed. Left out, the calculator uses its defaults.
    const number = (name) => {
      const v = flag(name);
      if (v === undefined) return undefined;
      const x = Number(v);
      if (v === true || !Number.isFinite(x) || x < 0) throw new Error(`--${name} needs a number of zero or more, for example --${name} ${name === 'min-share' ? '0.5' : '10000'}`);
      return x;
    };
    const options = { pricePerMTok: Number(flag('price') ?? 0) || undefined, minTokens: number('min-tokens'), minRepeats: number('min-repeats'), minPathShare: number('min-share') };
    const report = JSON.parse(value(await call('POST', `${CALC}/analyze`, { content, format: flag('format') ?? 'auto', options: JSON.stringify(options) })));
    if (asJson) return out(report);
    console.log(`format: ${report.format}, ${report.records} runs${report.problems.length ? `, ${report.problems.length} problems (first: line ${report.problems[0].line} ${report.problems[0].path} ${report.problems[0].message})` : ''}`);
    console.log(`Type 1 : 2 : 3 = ${report.ratio}  over ${report.window?.days ?? '?'} days`);
    const t = report.thresholds;
    console.log(`Thresholds: repeated >= ${n(t.minRepeats)} runs, stable >= ${Math.round(t.minPathShare * 100)}% of recent runs, valuable >= ${n(t.minTokens)} tokens spent`);
    console.log('            change them with --min-repeats N, --min-share 0..1 and --min-tokens N');
    console.log('\nOpportunities (ranked by tokens spent on the path):');
    for (const c of report.candidates.slice(0, 10)) {
      console.log(`  ${pad(c.verdict, 15)} ${pad(c.task, 24)} ${pad(c.path, 44)} ${pad(`${c.repeats}x`, 6)} ${n(c.score)} tokens${c.monthlyTokens ? `, ~${n(c.monthlyTokens)}/month` : ''}`);
      for (const r of c.reasons) console.log(`                  - ${r}`);
    }
  },

  async a2a() {
    const text = rest.join(' ') || 'Process the next supplier email';
    const res = await call('POST', `${BASE}/a2a`, { jsonrpc: '2.0', id: 1, method: 'message/send', params: { message: { role: 'user', kind: 'message', messageId: `m-${Date.now()}`, parts: [{ kind: 'text', text }] } } }, asUser ?? 'joule:joule');
    out(res, res.result?.status?.message?.parts?.[0]?.text ?? JSON.stringify(res));
  },

  async report() {
    const file = rest[0] ?? 'out/report.html';
    const [ratio, runs, playbooks] = await Promise.all([get('ratio()'), get('Runs?$orderby=seq'), get('Playbooks?$orderby=created_at')]);
    mkdirSync(file.split('/').slice(0, -1).join('/') || '.', { recursive: true });
    writeFileSync(file, renderReport({ ratio, runs: value(runs), playbooks: value(playbooks) }));
    console.log(`wrote ${file}`);
  },

  help() {
    console.log(`npm run ctl -- <command>

  next [n]            process the next n emails (stops when a playbook waits for a signature)
  process <msg-id>    process one email by id
  status              model, thresholds, mailbox, ratio, playbooks
  ratio               the Type 1 : 2 : 3 ratio with bars
  runs [n]            the last n runs
  playbooks           every playbook and its status
  show [id]           a playbook's code, backtest and decision history (default: the one waiting for a signature)
  sign [id]           sign an eligible playbook as the current user (--statement "...")
  reject [id]         stop a playbook (--reason "...")
  export [file]       this agent's runs as run-log JSONL
  analyze [file]      the opportunity calculator on a run log (default: this agent's runs; --format otel|runlog)
                      thresholds: --min-tokens N (default 100000)  --min-repeats N (10)  --min-share 0..1 (0.8)
                      cost: --price N (per million tokens)
  a2a "<text>"        talk to the agent over A2A, the way Joule does
  report [file]       write an HTML report with charts (default out/report.html)
  reset               delete all runs and playbooks, mark the mailbox unread

Options: --json  --as user:password  (ZT_URL, ZT_USER)`);
  },
};

try {
  if (!commands[command]) throw new Error(`unknown command "${command}". Try: npm run ctl -- help`);
  await commands[command]();
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(1);
}

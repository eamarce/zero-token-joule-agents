// End to end: start the CAP server with the simulated model, process the whole
// sample mailbox over HTTP, and check the cycle the talk describes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { validate } from '../srv/lib/schema.js';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
// node --test marks child processes as test workers; the server is not one.
const withoutTestContext = ({ NODE_TEST_CONTEXT, ...env }) => env;
let server;
let base;

const auth = (u) => `Basic ${Buffer.from(`${u}:${u}`).toString('base64')}`;
async function call(method, path, body, user = 'alice') {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: auth(user), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}
const post = (p, b, u) => call('POST', `/odata/v4/agent/${p}`, b ?? {}, u);
const get = async (p) => (await call('GET', `/odata/v4/agent/${p}`)).data;

before(async () => {
  server = spawn(process.execPath, [require.resolve('@sap/cds/bin/serve.js'), '--port', '0'], {
    cwd: ROOT,
    env: { ...withoutTestContext(process.env), NODE_ENV: 'test', ZT_MODEL_PROVIDER: 'simulated', ZT_PROFILE: 'demo', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GOOGLE_API_KEY: '', GEMINI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${log}`)), 30000);
    const onData = (d) => {
      log += d;
      const m = log.match(/server listening on \{ url: '([^']+)'/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    };
    server.on('error', (e) => reject(e));
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
  });
});

after(() => server?.kill());

test('the whole cycle: explore, propose, gate 1, sign, run with no model, drift, demote, v2', async () => {
  const runs = [];
  const next = async () => {
    const r = await post('processNext');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    runs.push(r.data);
    return r.data;
  };

  // 1-3: the agent explores; after the third the crystallizer proposes and gate 1 passes.
  for (let i = 0; i < 3; i++) assert.equal((await next()).runType, 3);
  assert.ok(runs[2].events.some((e) => e.startsWith('gate 1:')), runs[2].events.join('\n'));

  // 4-10: Type 2 with the code in the shadow until the playbook is eligible.
  for (let i = 0; i < 7; i++) await next();
  assert.ok(runs[9].events.some((e) => e.includes('eligible for gate 2')));

  const [pb] = (await get('Playbooks')).value;
  assert.equal(pb.status, 'eligible');

  // Gate 2: nobody but a person with the Approver role can sign.
  assert.equal((await post('sign', { playbook: pb.ID }, 'joule')).status, 403, 'AgentCaller is not Approver');
  assert.equal((await post('sign', { playbook: pb.ID }, 'bob')).status, 403, 'no role');
  const signed = await post('sign', { playbook: pb.ID, statement: 'reviewed' });
  assert.equal(signed.status, 200);

  // 11-40: frozen code, a question handed back to the model, drift, demotion, v2.
  while ((await get('status()')) && JSON.parse((await get('status()')).value).mailbox.unprocessed > 0) {
    await next();
    if (runs.at(-1).events.some((e) => e.includes('eligible for gate 2'))) {
      const v2 = (await get("Playbooks?$filter=status eq 'eligible'")).value[0];
      assert.equal((await post('sign', { playbook: v2.ID })).status, 200);
    }
  }
  assert.equal(runs.length, 40);

  const byId = Object.fromEntries(runs.map((r) => [r.messageId, r]));
  assert.equal(byId['msg-1011'].runType, 1, 'first run after the signature uses no model');
  assert.equal(byId['msg-1011'].tokens, 0);
  assert.equal(byId['msg-1013'].route, 'fallback', 'a question from the same supplier goes back to the model');
  assert.equal(byId['msg-1013'].task, 'reply_to_supplier');
  assert.ok(byId['msg-1025'].events.some((e) => e.includes('demoted')), 'two failed re-checks demote v1');
  assert.ok(runs.some((r) => r.events.some((e) => e.startsWith('proposed northwind-parts.example v2'))));
  assert.ok(byId['msg-1037'].events.some((e) => e.startsWith('backtest failed for contoso-metal.example v1')), 'the backtest rejects the Contoso code');

  const ratio = await get('ratio()');
  assert.equal(ratio.total, 40);
  assert.equal(ratio.rows.reduce((a, r) => a + r.runs, 0), 40);
  assert.equal(ratio.ratio.split(' : ').map(Number).reduce((a, b) => a + b, 0), 100);
  assert.equal(ratio.wrongServed, 3, 'v1 served three wrong totals before the re-checks caught it');
  assert.ok(ratio.proposalTokens > 0, 'writing candidate code is counted');
});

test('the exported run log validates against the schema and feeds the calculator', async () => {
  const jsonl = (await get('exportRunLog()')).value;
  const schema = JSON.parse(readFileSync(new URL('../schema/run-log.schema.json', import.meta.url), 'utf8'));
  const lines = jsonl.split('\n');
  assert.equal(lines.length, 40);
  for (const line of lines) assert.deepEqual(validate(JSON.parse(line), schema), []);
  const res = await call('POST', '/odata/v4/calculator/analyze', { content: jsonl, format: 'auto', options: '{}' });
  assert.equal(res.status, 200);
  const report = JSON.parse(res.data.value);
  assert.equal(report.valid, 40);
});

test('A2A: agent card is public, message/send needs AgentCaller, answers like Joule expects', async () => {
  const card = await (await fetch(`${base}/.well-known/agent.json`)).json();
  assert.equal(card.protocolVersion, '0.3.0');
  assert.match(card.url, /\/a2a$/);

  const send = (text, user) =>
    fetch(`${base}/a2a`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(user ? { authorization: auth(user) } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'message/send', params: { message: { role: 'user', kind: 'message', messageId: 'm1', parts: [{ kind: 'text', text }] } } }),
    });
  assert.equal((await send('What is the run ratio?')).status, 401);
  assert.equal((await send('What is the run ratio?', 'bob')).status, 403);

  const ok = await (await send('What is the run ratio?', 'joule')).json();
  assert.equal(ok.id, 7);
  assert.equal(ok.result.status.state, 'completed');
  assert.match(ok.result.status.message.parts[0].text, /^Type 1 : 2 : 3 = /);

  const again = await (await send('Process email msg-1001', 'joule')).json();
  assert.match(again.result.status.message.parts[0].text, /^msg-1001: /);

  const got = await (
    await fetch(`${base}/a2a`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth('joule') },
      body: JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tasks/get', params: { id: ok.result.id } }),
    })
  ).json();
  assert.equal(got.result.id, ok.result.id);
});

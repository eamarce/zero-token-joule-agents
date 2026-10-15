import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classify, classifyRun, percentages } from '../srv/lib/classify.js';
import { buildCandidates } from '../srv/lib/paths.js';
import { testFour } from '../srv/lib/test4.js';
import { loadExtractor } from '../srv/lib/sandbox.js';
import { backtest } from '../srv/lib/backtest.js';
import { otelToRunLog } from '../srv/lib/otel.js';
import { analyze, detectFormat } from '../srv/lib/analyze.js';
import { checkOrder, sameAnswer } from '../srv/agent/check.js';
import { readOrder, writeExtractor } from '../srv/agent/simulated.js';

const run = (id, task, tools, input, output, playbook = null, at = '2026-10-01T08:00:00Z') => ({
  run_id: id,
  task,
  started_at: at,
  playbook_id: playbook,
  tool_calls: tools.map((name) => ({ name, input: null, output: null })),
  tokens: { input, output },
  outcome: { status: 'clean' },
});

test('classifyRun: zero tokens is Type 1, a playbook with tokens is Type 2, the rest Type 3', () => {
  assert.equal(classifyRun(run('a', 't', [], 0, 0)), 1);
  assert.equal(classifyRun(run('b', 't', [], 10, 1, 'pb')), 2);
  assert.equal(classifyRun(run('c', 't', [], 10, 1)), 3);
});

test('percentages always add up to 100', () => {
  for (const c of [[60, 40, 192], [15, 14, 11], [1, 1, 1], [0, 0, 7], [3, 0, 0]]) {
    assert.equal(percentages(c).reduce((a, b) => a + b, 0), 100, `for ${c}`);
  }
  assert.deepEqual(percentages([0, 0, 0]), [0, 0, 0]);
  assert.equal(classify([run('a', 't', [], 0, 0), run('b', 't', [], 5, 5), run('c', 't', [], 5, 5)]).ratio, '33 : 0 : 67');
});

test('shortlist ranks paths by tokens spent and the four questions use the log and the answers', () => {
  const runs = [];
  for (let i = 0; i < 12; i++) runs.push(run(`r${i}`, 'parse', ['read', 'write'], 9000, 1000, null, `2026-10-01T08:${String(i).padStart(2, '0')}:00Z`));
  for (let i = 0; i < 3; i++) runs.push(run(`q${i}`, 'dispute', ['read', 'search', 'reply'], 30000, 2000));
  const [top] = buildCandidates(runs);
  assert.equal(top.task, 'parse');
  assert.equal(top.repeats, 12);
  assert.equal(testFour(top, {}).verdict, 'keep-with-model', 'operable needs a person');
  assert.equal(testFour(top, { owner: 'a', test: 'b', fallback: 'c' }).verdict, 'freeze');
});

test('sandbox: model-written code gets no require, no process; a timeout stops loops', () => {
  const ok = loadExtractor('function extract(i){ return { n: i.n * 2 }; }');
  assert.deepEqual(ok({ n: 2 }), { n: 4 });
  const noRequire = loadExtractor('function extract(){ return typeof require + typeof process; }');
  assert.equal(noRequire({}), 'undefinedundefined');
  assert.throws(() => loadExtractor('function extract(){ while(true){} }', { timeoutMs: 50 })({}), /timed out/i);
  assert.throws(() => loadExtractor('const x = 1;'), /extract/);
});

test('the simulated model reads both supplier templates, including thousands separators', () => {
  const nw = 'Order number: PO-1\nOrder date: 2026-10-01\nTotal: 1,250.00 EUR';
  assert.deepEqual(readOrder(nw), { order_no: 'PO-1', order_date: '2026-10-01', total: 1250, currency: 'EUR' });
  const cm = 'Our ref. PO 7782, dated 08.10.2026, amount EUR 1.240,50.';
  assert.deepEqual(readOrder(cm), { order_no: 'PO-7782', order_date: '2026-10-08', total: 1240.5, currency: 'EUR' });
  assert.equal(readOrder('Can you ship before Friday?'), null);
});

test('backtest catches the bug the output check cannot: a plausible wrong total', () => {
  const ex = (total) => ({ input: { body: `Order number: PO-1\nOrder date: 2026-10-01\nTotal: ${total} EUR` } });
  const v1 = writeExtractor([ex('412.50'), ex('88.00')]);
  const drift = { run_id: 'r9', input: ex('1,250.00').input, expected: { order_no: 'PO-1', order_date: '2026-10-01', total: 1250, currency: 'EUR' } };
  const wrong = loadExtractor(v1)(drift.input);
  assert.equal(wrong.total, 1, 'parseFloat stops at the comma');
  assert.deepEqual(checkOrder(wrong), [], 'the output check passes: it only checks the shape');
  const bt = backtest(v1, [drift], { same: sameAnswer, minCases: 1 });
  assert.equal(bt.verdict, 'fail');
  const v2 = writeExtractor([ex('412.50'), ex('1,250.00')]);
  assert.equal(backtest(v2, [drift], { same: sameAnswer, minCases: 1 }).verdict, 'pass');
});

test('OpenTelemetry GenAI traces become run-log records', () => {
  const doc = JSON.parse(readFileSync(new URL('../samples/otel.sample.json', import.meta.url), 'utf8'));
  const runs = otelToRunLog([doc]);
  assert.equal(runs.length, 67);
  const first = runs[0];
  assert.equal(first.task, 'post_vendor_invoice');
  assert.deepEqual(first.tool_calls.map((c) => c.name), ['read_invoice', 'lookup_vendor', 'post_invoice']);
  assert.equal(first.tokens.model_calls, 3);
  assert.ok(first.tokens.input > 0);
  assert.equal(runs.filter((r) => r.playbook_id === 'pb-invoice-v1').length, 12);
  assert.equal(runs.filter((r) => r.outcome.status === 'corrected').length, 1);
});

test('calculator: detects the format, validates, and ranks opportunities', () => {
  const otel = readFileSync(new URL('../samples/otel.sample.json', import.meta.url), 'utf8');
  const log = readFileSync(new URL('../samples/runs.sample.jsonl', import.meta.url), 'utf8');
  assert.equal(detectFormat(otel), 'otel');
  assert.equal(detectFormat(log), 'runlog');
  const r = analyze(otel, { pricePerMTok: 3 });
  assert.equal(r.valid, 67);
  assert.equal(r.candidates[0].task, 'post_vendor_invoice');
  assert.equal(r.candidates[0].verdict, 'candidate');
  assert.ok(r.candidates[0].monthlyCost > 0);
  const answered = analyze(otel, { answers: { post_vendor_invoice: { owner: 'AP team', test: 'tests.json', fallback: 'model' } } });
  assert.equal(answered.candidates[0].verdict, 'freeze');
  // The tokens needed for "valuable" can be lowered, to see results before 100,000 tokens have been spent.
  const cheap = (x) => x.candidates.find((c) => c.task === 'check_duplicate');
  assert.equal(r.thresholds.minTokens, 100_000);
  assert.equal(cheap(r).valuable, false);
  assert.equal(cheap(r).verdict, 'keep-with-model');
  const lowered = analyze(otel, { minTokens: 1000 });
  assert.equal(lowered.thresholds.minTokens, 1000);
  assert.equal(cheap(lowered).valuable, true);
  assert.equal(cheap(lowered).verdict, 'candidate');
  assert.equal(analyze(otel, { minTokens: 0 }).thresholds.minTokens, 0);
  const bad = analyze('{"run_id":"x"}\nnot json\n');
  assert.equal(bad.valid, 0);
  assert.ok(bad.problemCount >= 2);
});

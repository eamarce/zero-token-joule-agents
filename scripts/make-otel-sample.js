// Writes samples/otel.sample.json: synthetic OpenTelemetry traces (OTLP JSON)
// from an invented invoice-triage agent, using the GenAI semantic conventions
// plus the three zt.* attributes the calculator reads (see srv/lib/otel.js).
//
//   node scripts/make-otel-sample.js
//
// Deterministic: same output every time.
import { writeFileSync } from 'node:fs';

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const hex = (n) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join('');
const attr = (key, v) => ({ key, value: typeof v === 'number' ? (Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v }) : { stringValue: String(v) } });

const start = BigInt(Date.parse('2026-09-01T08:00:00Z')) * 1_000_000n;
const minute = 60_000_000_000n;

function trace(i, task, tools, tokensPerCall, { playbook = null, outcome = 'clean' } = {}) {
  const traceId = hex(32);
  const rootId = hex(16);
  const t0 = start + BigInt(i) * 47n * minute;
  const spans = [
    {
      traceId,
      spanId: rootId,
      name: `invoke_agent ${task}`,
      startTimeUnixNano: String(t0),
      endTimeUnixNano: String(t0 + 2n * minute),
      attributes: [attr('gen_ai.operation.name', 'invoke_agent'), attr('gen_ai.agent.name', 'invoice-triage'), attr('zt.task', task), attr('zt.outcome', outcome), ...(playbook ? [attr('zt.playbook_id', playbook)] : [])],
      status: { code: outcome === 'failed' ? 2 : 1 },
    },
  ];
  let t = t0 + 1_000_000_000n;
  tools.forEach((name, k) => {
    if (tokensPerCall) {
      const input = Math.round(tokensPerCall * (0.85 + rand() * 0.3));
      spans.push({
        traceId,
        spanId: hex(16),
        parentSpanId: rootId,
        name: 'chat example-model',
        startTimeUnixNano: String(t),
        endTimeUnixNano: String(t + 2_000_000_000n),
        attributes: [attr('gen_ai.operation.name', 'chat'), attr('gen_ai.request.model', 'example-model'), attr('gen_ai.usage.input_tokens', input), attr('gen_ai.usage.output_tokens', Math.round(input / 12))],
        status: { code: 1 },
      });
      t += 3_000_000_000n;
    }
    spans.push({
      traceId,
      spanId: hex(16),
      parentSpanId: rootId,
      name: `execute_tool ${name}`,
      startTimeUnixNano: String(t),
      endTimeUnixNano: String(t + 500_000_000n),
      attributes: [attr('gen_ai.operation.name', 'execute_tool'), attr('gen_ai.tool.name', name), attr('gen_ai.tool.call.id', `call_${i}_${k}`)],
      status: { code: 1 },
    });
    t += 1_000_000_000n;
  });
  return spans;
}

const spans = [];
let i = 0;
// The repeated path: 30 invoices from known vendors, same three tools.
for (let k = 0; k < 30; k++) spans.push(...trace(i++, 'post_vendor_invoice', ['read_invoice', 'lookup_vendor', 'post_invoice'], 1800));
// Already a playbook: 12 runs where only one narrow model call remained.
for (let k = 0; k < 12; k++) spans.push(...trace(i++, 'post_vendor_invoice', ['read_invoice', 'lookup_vendor', 'post_invoice'], k % 3 ? 0 : 400, { playbook: 'pb-invoice-v1' }));
// Disputes: expensive, and the path keeps changing.
const disputePaths = [
  ['read_invoice', 'search_contract', 'draft_reply'],
  ['read_invoice', 'lookup_vendor', 'search_contract', 'draft_reply'],
  ['read_invoice', 'search_email', 'search_contract', 'draft_reply'],
  ['read_invoice', 'lookup_vendor', 'draft_reply'],
];
for (let k = 0; k < 14; k++) spans.push(...trace(i++, 'handle_invoice_dispute', disputePaths[k % disputePaths.length], 4200, { outcome: k === 5 ? 'corrected' : 'clean' }));
// Duplicate checks: repeated and cheap, so not worth a playbook yet.
for (let k = 0; k < 11; k++) spans.push(...trace(i++, 'check_duplicate', ['search_invoices'], 300));

const doc = {
  resourceSpans: [
    {
      resource: { attributes: [attr('service.name', 'invoice-triage-agent')] },
      scopeSpans: [{ scope: { name: 'example-instrumentation' }, spans }],
    },
  ],
};
writeFileSync(new URL('../samples/otel.sample.json', import.meta.url), `${JSON.stringify(doc)}\n`);
console.log(`wrote ${i} traces (${spans.length} spans) to samples/otel.sample.json`);

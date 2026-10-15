/**
 * Convert OpenTelemetry traces (OTLP JSON, as written by the OTLP file
 * exporter or returned by most trace backends' export) into run-log records.
 *
 * It reads the GenAI semantic conventions. Those conventions are still marked
 * "Development" by OpenTelemetry, so attribute names can change; the mapping is
 * kept in one place on purpose.
 *
 *   one trace                           -> one run
 *   spans with gen_ai.operation.name = execute_tool
 *                                       -> tool_calls, in start-time order, named by gen_ai.tool.name
 *   gen_ai.usage.input_tokens / output_tokens on any span
 *                                       -> tokens (summed); spans carrying them count as model calls
 *
 * Three things OpenTelemetry does not define, read from attributes you add yourself:
 *   zt.task         the kind of case (falls back to gen_ai.agent.name, then the root span name)
 *   zt.playbook_id  set when a playbook ran the steps
 *   zt.outcome      clean | corrected | failed (falls back to the root span's status)
 */

const attrValue = (v) => {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('intValue' in v) return Number(v.intValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('boolValue' in v) return v.boolValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(attrValue);
  return null;
};

const attrs = (list) => Object.fromEntries((list ?? []).map((a) => [a.key, attrValue(a.value)]));

const nanosToIso = (n) => new Date(Number(BigInt(String(n ?? 0)) / 1_000_000n)).toISOString();

const tryJson = (s) => {
  if (typeof s !== 'string') return s ?? null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

/** Every span from one OTLP JSON document, or from several (one per line). */
export function spansFrom(docs) {
  const spans = [];
  for (const doc of docs) {
    for (const rs of doc.resourceSpans ?? []) {
      for (const ss of rs.scopeSpans ?? rs.instrumentationLibrarySpans ?? []) {
        for (const s of ss.spans ?? []) spans.push({ ...s, attributes: attrs(s.attributes) });
      }
    }
  }
  return spans;
}

export function otelToRunLog(docs) {
  const byTrace = new Map();
  for (const s of spansFrom(docs)) {
    if (!byTrace.has(s.traceId)) byTrace.set(s.traceId, []);
    byTrace.get(s.traceId).push(s);
  }
  const runs = [];
  for (const [traceId, spans] of byTrace) {
    spans.sort((a, b) => (BigInt(String(a.startTimeUnixNano ?? 0)) < BigInt(String(b.startTimeUnixNano ?? 0)) ? -1 : 1));
    const root = spans.find((s) => !s.parentSpanId) ?? spans[0];
    const find = (key) => spans.map((s) => s.attributes[key]).find((v) => v != null);
    const tools = spans.filter((s) => s.attributes['gen_ai.operation.name'] === 'execute_tool');
    const usage = spans.filter((s) => s.attributes['gen_ai.usage.input_tokens'] != null || s.attributes['gen_ai.usage.output_tokens'] != null);
    const declared = find('zt.outcome');
    runs.push({
      schema_version: '1',
      run_id: traceId,
      task: find('zt.task') ?? find('gen_ai.agent.name') ?? root.name ?? 'unknown',
      started_at: nanosToIso(root.startTimeUnixNano).replace(/\.\d{3}Z$/, 'Z'),
      playbook_id: find('zt.playbook_id') ?? null,
      tool_calls: tools.map((s) => ({
        name: s.attributes['gen_ai.tool.name'] ?? s.name.replace(/^execute_tool\s*/, '') ?? 'tool',
        input: tryJson(s.attributes['gen_ai.tool.call.arguments']),
        output: tryJson(s.attributes['gen_ai.tool.call.result']),
        error: s.status?.code === 2 || s.status?.code === 'STATUS_CODE_ERROR' ? (s.status.message ?? 'error') : null,
      })),
      tokens: {
        input: usage.reduce((a, s) => a + (s.attributes['gen_ai.usage.input_tokens'] ?? 0), 0),
        output: usage.reduce((a, s) => a + (s.attributes['gen_ai.usage.output_tokens'] ?? 0), 0),
        model_calls: usage.length,
      },
      outcome: {
        status: ['clean', 'corrected', 'failed'].includes(declared)
          ? declared
          : root.status?.code === 2 || root.status?.code === 'STATUS_CODE_ERROR'
            ? 'failed'
            : 'clean',
      },
      metadata: { source: 'otel', spans: spans.length },
    });
  }
  return runs;
}

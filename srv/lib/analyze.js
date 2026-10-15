import { readFileSync } from 'node:fs';
import { classify } from './classify.js';
import { buildCandidates } from './paths.js';
import { testFour } from './test4.js';
import { validate } from './schema.js';
import { parseJsonl } from './util.js';
import { otelToRunLog } from './otel.js';

const RUN_LOG_SCHEMA = JSON.parse(readFileSync(new URL('../../schema/run-log.schema.json', import.meta.url), 'utf8'));

/** runlog (JSONL of run records) or otel (OTLP JSON, one document or one per line). */
export function detectFormat(text) {
  const t = String(text).trimStart();
  if (t.startsWith('{"resourceSpans"') || /^\{\s*"resourceSpans"/.test(t)) return 'otel';
  const first = t.split(/\r?\n/, 1)[0];
  try {
    const v = JSON.parse(first);
    if (v && v.resourceSpans) return 'otel';
  } catch {
    // a pretty-printed OTLP document spans many lines
    try {
      if (JSON.parse(t).resourceSpans) return 'otel';
    } catch {
      // fall through
    }
  }
  return 'runlog';
}

function readRecords(text, format) {
  if (format === 'otel') {
    let docs;
    try {
      docs = [JSON.parse(text)];
    } catch {
      docs = parseJsonl(text).records.map((r) => r.value);
    }
    return { records: otelToRunLog(docs).map((value, i) => ({ line: i + 1, value })), errors: [] };
  }
  return parseJsonl(text);
}

/**
 * The opportunity calculator. Deterministic: it reads a log and does
 * arithmetic. It calls no model, so it needs no API key.
 *
 * options: { minRepeats, minPathShare, minTokens, pricePerMTok,
 *            answers: { "<task> <path>" | "<task>": { owner, test, fallback, audit_required, stable } } }
 */
export function analyze(text, { format = 'auto', ...options } = {}) {
  const fmt = format === 'auto' || !format ? detectFormat(text) : format;
  const { records, errors } = readRecords(text, fmt);
  const problems = errors.map((e) => ({ line: e.line, path: '$', message: e.message }));
  const runs = [];
  const seen = new Set();
  for (const { line, value } of records) {
    const errs = validate(value, RUN_LOG_SCHEMA);
    if (value?.run_id && seen.has(value.run_id)) errs.push({ path: '$.run_id', message: `duplicate run_id ${value.run_id}` });
    seen.add(value?.run_id);
    if (errs.length) problems.push(...errs.map((e) => ({ line, ...e })));
    else runs.push(value);
  }

  const c = classify(runs);
  const times = runs.map((r) => Date.parse(r.started_at)).filter(Number.isFinite);
  const from = times.length ? Math.min(...times) : null;
  const to = times.length ? Math.max(...times) : null;
  const days = from == null ? null : Math.max(1, Math.round(((to - from) / 86_400_000) * 10) / 10);

  const opts = {};
  for (const k of ['minRepeats', 'minPathShare', 'minTokens']) if (options[k] != null) opts[k] = Number(options[k]);
  const price = Number(options.pricePerMTok) || null;

  const candidates = buildCandidates(runs)
    .slice(0, 20)
    .map((cand) => {
      const answers = options.answers?.[`${cand.task} ${cand.path}`] ?? options.answers?.[cand.task] ?? {};
      const t4 = testFour(cand, answers, opts);
      const fromLog = t4.repeated && t4.stable && t4.valuable;
      const verdict = fromLog && t4.operable ? 'freeze' : fromLog ? 'candidate' : 'keep-with-model';
      const monthlyTokens = days ? Math.round((cand.score / days) * 30) : null;
      return {
        ...cand,
        pathShare: Math.round(cand.pathShare * 100) / 100,
        repeated: t4.repeated,
        stable: t4.stable,
        valuable: t4.valuable,
        operable: t4.operable,
        verdict,
        reasons: verdict === 'candidate' ? ['passes the three questions the log can answer; name an owner, a test and a fallback to make it operable'] : t4.reasons,
        monthlyTokens,
        monthlyCost: price && monthlyTokens != null ? Math.round((monthlyTokens / 1e6) * price * 100) / 100 : null,
      };
    });

  return {
    format: fmt,
    records: records.length,
    valid: runs.length,
    problems: problems.slice(0, 50),
    problemCount: problems.length,
    ratio: c.total ? c.ratio : '0 : 0 : 0',
    rows: c.rows,
    total: c.total,
    allTokens: c.allTokens,
    window: from == null ? null : { from: new Date(from).toISOString(), to: new Date(to).toISOString(), days },
    thresholds: { minRepeats: 10, minPathShare: 0.8, minTokens: 100_000, ...opts },
    candidates,
    notes: [
      'Type 1 runs spent no tokens; they are already frozen and are not candidates.',
      'Monthly figures extrapolate the log window to 30 days. They are arithmetic, not a forecast.',
      'Operable cannot be read from a log: a person names the owner, the test and the fallback.',
    ],
  };
}

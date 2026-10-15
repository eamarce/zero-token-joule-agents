import { loadExtractor } from './sandbox.js';

/**
 * Run a candidate extractor in the sandbox against past cases, where the
 * model's recorded answer is the oracle.
 *
 * cases: [{ run_id, input, expected }]
 * same(a, b): how two answers are compared.
 *
 * A pass means "ready for the next gate", never "approved". A backtest also
 * inherits every mistake the model made the first time: if the model was
 * wrong, the code learns the same mistake.
 */
export function backtest(source, cases, { same, minCases = 1, timeoutMs = 1000 }) {
  let extract;
  try {
    extract = loadExtractor(source, { timeoutMs });
  } catch (e) {
    return { verdict: 'fail', compared: 0, matched: 0, mismatches: [], reasons: [`code does not load: ${e.message}`] };
  }
  const mismatches = [];
  for (const c of cases) {
    let actual;
    let error;
    try {
      actual = extract(c.input);
    } catch (e) {
      error = e.message;
    }
    if (error || !same(actual, c.expected)) mismatches.push({ run_id: c.run_id, expected: c.expected, actual: actual ?? null, error: error ?? null });
  }
  const compared = cases.length;
  const reasons = [];
  if (compared < minCases) reasons.push(`only ${compared} past runs to compare, need ${minCases}`);
  if (mismatches.length) reasons.push(`${mismatches.length} of ${compared} past runs differ from the model's recorded answer`);
  return { verdict: reasons.length ? 'fail' : 'pass', compared, matched: compared - mismatches.length, mismatches, reasons };
}

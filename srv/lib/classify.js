import { sum } from './util.js';

export const totalTokens = (run) => run.tokens.input + run.tokens.output;

/**
 * Observed run type, computed from the log rather than trusted from the producer.
 *   Type 1: no tokens at all (rules and code ran the case).
 *   Type 2: a playbook ran the steps and the model was still called.
 *   Type 3: no playbook; the agent explored the case.
 */
export function classifyRun(run) {
  if (totalTokens(run) === 0) return 1;
  if (run.playbook_id) return 2;
  return 3;
}

export function classify(runs) {
  const types = { 1: [], 2: [], 3: [] };
  const mismatches = [];
  for (const run of runs) {
    const t = classifyRun(run);
    types[t].push(run);
    if (run.run_type != null && run.run_type !== t) {
      mismatches.push({ run_id: run.run_id, declared: run.run_type, observed: t });
    }
  }
  const total = runs.length;
  const allTokens = sum(runs.map(totalTokens));
  const pct = percentages([1, 2, 3].map((t) => types[t].length));
  const rows = [1, 2, 3].map((t, i) => {
    const tokens = sum(types[t].map(totalTokens));
    return {
      type: t,
      runs: types[t].length,
      share: total ? types[t].length / total : 0,
      pct: pct[i],
      tokens,
      tokenShare: allTokens ? tokens / allTokens : 0,
      meanTokens: types[t].length ? Math.round(tokens / types[t].length) : 0,
    };
  });
  return { total, allTokens, rows, ratio: pct.join(' : '), mismatches };
}

/** Whole percentages that always add up to 100 (largest remainder), so "38 : 35 : 28" cannot happen. */
export function percentages(counts) {
  const total = sum(counts);
  if (!total) return counts.map(() => 0);
  const exact = counts.map((c) => (c * 100) / total);
  const out = exact.map(Math.floor);
  const order = exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  const missing = 100 - sum(out);
  for (let k = 0; k < missing; k++) out[order[k][1]]++;
  return out;
}

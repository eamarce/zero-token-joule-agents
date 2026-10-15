/**
 * The four questions. Fail any one and the path stays with the model.
 *
 *   repeated  - enough runs on the same path (default 10; five is a coincidence)
 *   stable    - the path has not been changing lately (default >= 80% of recent runs)
 *   valuable  - high token spend, or a person says it must be auditable
 *   operable  - someone named an owner, a test, and a way back to the model
 *
 * The first three are computed from the log. Operable cannot be: a script
 * cannot know who owns a playbook. It comes from the answers file.
 */
export const DEFAULTS = { minRepeats: 10, minPathShare: 0.8, minTokens: 100_000 };

export function testFour(candidate, answers = {}, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const reasons = [];

  const repeated = candidate.repeats >= o.minRepeats;
  if (!repeated) reasons.push(`repeated: ${candidate.repeats} runs, need ${o.minRepeats}`);

  let stable = candidate.pathShare >= o.minPathShare;
  if (!stable) reasons.push(`stable: path is ${Math.round(candidate.pathShare * 100)}% of recent runs, need ${Math.round(o.minPathShare * 100)}%`);
  if (answers.stable === false) {
    stable = false;
    reasons.push('stable: owner says the input changes too often');
  }

  const audit = answers.audit_required === true;
  const valuable = candidate.score >= o.minTokens || audit;
  if (!valuable) reasons.push(`valuable: ${candidate.score} tokens spent, need ${o.minTokens} or an audit requirement`);

  const missing = ['owner', 'test', 'fallback'].filter((k) => !answers[k]);
  const operable = missing.length === 0;
  if (!operable) reasons.push(`operable: missing ${missing.join(', ')}`);

  const pass = repeated && stable && valuable && operable;
  return { task: candidate.task, path: candidate.path, repeated, stable, valuable, operable, verdict: pass ? 'freeze' : 'keep-with-model', reasons };
}

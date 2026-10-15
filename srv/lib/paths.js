import { classifyRun, totalTokens } from './classify.js';
import { byTime, group, sum } from './util.js';

export const pathKey = (run) => run.tool_calls.map((c) => c.name).join('>') || '(no tool calls)';

/**
 * Group model-using runs (Type 2 and 3) by task and tool path, and rank the
 * paths by repeats x mean tokens, which equals the tokens the path has cost.
 *
 * pathShare is a stability proxy: the share of the task's most recent runs
 * (default 20) that followed this path. A task whose path keeps changing is
 * not ready to freeze. It is a proxy, not a measure of input drift.
 */
export function buildCandidates(runs, { window = 20 } = {}) {
  const live = runs.filter((r) => classifyRun(r) !== 1).sort(byTime);
  const out = [];
  for (const [task, taskRuns] of group(live, (r) => r.task)) {
    const recent = taskRuns.slice(-window);
    for (const [path, rs] of group(taskRuns, pathKey)) {
      const tokens = sum(rs.map(totalTokens));
      out.push({
        task,
        path,
        repeats: rs.length,
        meanTokens: Math.round(tokens / rs.length),
        score: tokens, // repeats x mean tokens
        pathShare: recent.filter((r) => pathKey(r) === path).length / recent.length,
        lastSeen: rs.at(-1).started_at,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.task.localeCompare(b.task));
}

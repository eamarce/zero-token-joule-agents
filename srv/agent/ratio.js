import cds from '@sap/cds';
import { classify } from '../lib/classify.js';
import { modelConfig, profile } from './config.js';

const { SELECT } = cds.ql;

/** A Runs row in the run-log shape the shared classifier expects. */
export const asLogRecord = (r) => ({
  run_id: r.ID,
  task: r.task,
  started_at: r.started_at,
  playbook_id: r.playbook_ID ?? null,
  tokens: { input: r.tokens_input ?? 0, output: r.tokens_output ?? 0 },
});

/** The Type 1 : 2 : 3 ratio over every run so far, plus the costs the ratio alone would hide. */
export async function computeRatio() {
  const runs = await SELECT.from('zt.Runs').columns('ID', 'task', 'started_at', 'playbook_ID', 'tokens_input', 'tokens_output', 'wrong');
  const c = classify(runs.map(asLogRecord));
  const proposals = await SELECT.from('zt.ModelCalls').columns('tokens_input', 'tokens_output').where({ purpose: 'propose' });
  const m = modelConfig();
  return {
    ratio: c.total ? c.ratio : '0 : 0 : 0',
    total: c.total,
    allTokens: c.allTokens,
    proposalTokens: proposals.reduce((a, p) => a + p.tokens_input + p.tokens_output, 0),
    wrongServed: runs.filter((r) => r.wrong).length,
    rows: c.rows.map((r) => ({ ...r, share: Number(r.share.toFixed(4)), tokenShare: Number(r.tokenShare.toFixed(4)) })),
    profile: profile().name,
    model: `${m.provider}${m.provider === 'simulated' ? '' : `:${m.model}`}`,
  };
}

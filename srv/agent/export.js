import cds from '@sap/cds';

const { SELECT } = cds.ql;

const parse = (s) => (s == null ? null : JSON.parse(s));
const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * This agent's history as run-log JSONL (schema/run-log.schema.json), the same
 * format the calculator reads. Signatures are attached to the runs of the
 * version they signed, so the log carries the evidence and the signature together.
 */
export async function exportRunLog() {
  const runs = await SELECT.from('zt.Runs')
    .columns('*', { ref: ['tool_calls'], expand: ['*'] })
    .orderBy('seq');
  const playbooks = await SELECT.from('zt.Playbooks').columns('ID', 'version', 'signed_by', 'signed_at', 'signature_statement');
  const byId = new Map(playbooks.map((p) => [p.ID, p]));
  return runs
    .map((r) => {
      const pb = r.playbook_ID ? byId.get(r.playbook_ID) : null;
      const record = {
        schema_version: '1',
        run_id: r.ID,
        task: r.task,
        started_at: iso(r.started_at),
        run_type: r.run_type,
        playbook_id: r.playbook_ID ?? null,
        playbook_version: pb ? String(pb.version) : null,
        tool_calls: [...r.tool_calls]
          .sort((a, b) => a.seq - b.seq)
          .map((c) => ({ name: c.name, input: parse(c.input_json), output: parse(c.output_json), error: c.error ?? null, duration_ms: c.duration_ms ?? 0 })),
        tokens: { input: r.tokens_input ?? 0, output: r.tokens_output ?? 0, model_calls: r.model_calls ?? 0 },
        outcome: { status: r.status === 'clean' ? 'clean' : 'failed', tests_passed: r.status === 'clean' },
        signature: pb?.signed_by
          ? { signed_by: pb.signed_by, signed_at: iso(pb.signed_at), playbook_version: String(pb.version), ...(pb.signature_statement ? { statement: pb.signature_statement } : {}) }
          : null,
        metadata: {
          route: r.route,
          subject_key: r.subject_key,
          message_id: r.message_id,
          model: r.model,
          tokens_estimated: r.tokens_estimated,
          shadow_match: r.shadow_match,
          note: r.note,
        },
      };
      return JSON.stringify(record);
    })
    .join('\n');
}

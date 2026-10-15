import cds from '@sap/cds';
import { processMessage, processNext } from './agent/engine.js';
import { computeRatio } from './agent/ratio.js';
import { reject, sign } from './agent/crystallizer.js';
import { modelConfig, profile } from './agent/config.js';
import { loadMailbox, resetAll } from './agent/mailbox.js';
import { exportRunLog } from './agent/export.js';

const { SELECT } = cds.ql;

export default class AgentService extends cds.ApplicationService {
  init() {
    const fail = (req, e) => req.error(e.status ?? 500, e.message);

    this.on('processNext', async (req) => {
      try {
        return await processNext();
      } catch (e) {
        return fail(req, e);
      }
    });

    this.on('process', async (req) => {
      try {
        return await processMessage(req.data.messageId);
      } catch (e) {
        return fail(req, e);
      }
    });

    this.on('sign', async (req) => {
      try {
        return await sign(req.data.playbook, req.user.id, req.data.statement);
      } catch (e) {
        return fail(req, e);
      }
    });

    this.on('rejectPlaybook', async (req) => {
      try {
        return await reject(req.data.playbook, req.user.id, req.data.rationale);
      } catch (e) {
        return fail(req, e);
      }
    });

    // Bound versions of sign / rejectPlaybook for the Playbooks app (Fiori elements).
    // Same logic and same checks (Approver role, named person, status); they only add the
    // playbook from the row the user is on and answer with the updated row.
    this.on('signPlaybook', 'Playbooks', async (req) => {
      try {
        const { ID } = req.params.at(-1);
        req.notify(await sign(ID, req.user.id, req.data.statement));
        return await this.run(SELECT.one.from(req.subject));
      } catch (e) {
        return fail(req, e);
      }
    });

    this.on('declinePlaybook', 'Playbooks', async (req) => {
      try {
        const { ID } = req.params.at(-1);
        req.notify(await reject(ID, req.user.id, req.data.rationale));
        return await this.run(SELECT.one.from(req.subject));
      } catch (e) {
        return fail(req, e);
      }
    });

    this.on('reset', async (req) => {
      if (process.env.NODE_ENV === 'production' && process.env.ZT_ALLOW_RESET !== 'true') {
        return req.error(403, 'reset is disabled in production; set ZT_ALLOW_RESET=true for a demo deployment');
      }
      await resetAll();
      await loadMailbox({ unread: true });
      return 'All runs, orders, replies and playbooks deleted. The mailbox is unread again.';
    });

    this.on('ratio', () => computeRatio());

    this.on('status', async () => {
      const m = modelConfig();
      const [emails, left, playbooks, ratio] = await Promise.all([
        SELECT.one.from('zt.Emails').columns('count(1) as n'),
        SELECT.one.from('zt.Emails').columns('count(1) as n').where({ processed: false }),
        SELECT.from('zt.Playbooks')
          .columns('ID', 'name', 'subject_key', 'version', 'status', 'streak', 'streak_needed', 'frozen_runs', 'rechecks', 'recheck_failures', 'signed_by', 'backtest_compared', 'backtest_matched')
          .orderBy('created_at'),
        computeRatio(),
      ]);
      const next = await SELECT.one.from('zt.Emails').columns('ID', 'sender', 'subject').where({ processed: false }).orderBy('seq');
      return JSON.stringify(
        {
          model: { provider: m.provider, model: m.provider === 'simulated' ? null : m.model, tokens_estimated: m.estimated },
          profile: profile(),
          mailbox: { total: emails.n, unprocessed: left.n, next: next ?? null },
          ratio,
          playbooks,
          contracts: {
            parse_order_email: 'can be crystallized: the answer is four fields that can be tested',
            reply_to_supplier: 'stays with the model: a free-text reply has no single right answer to test against',
          },
        },
        null,
        2,
      );
    });

    this.on('exportRunLog', () => exportRunLog());

    return super.init();
  }
}

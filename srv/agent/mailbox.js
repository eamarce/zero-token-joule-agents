import cds from '@sap/cds';
import { readFileSync } from 'node:fs';

const { SELECT, INSERT, DELETE, UPDATE } = cds.ql;

const MAILBOX = new URL('../../data/mailbox.json', import.meta.url);

/**
 * Load suppliers and emails from data/mailbox.json if the tables are empty.
 * With { unread: true } (used by reset) every email is marked unread again.
 */
export async function loadMailbox({ unread = false } = {}) {
  const { suppliers, emails } = JSON.parse(readFileSync(MAILBOX, 'utf8'));
  const have = await SELECT.one.from('zt.Emails').columns('count(1) as n');
  if (!have?.n) {
    await INSERT.into('zt.Suppliers').entries(suppliers);
    await INSERT.into('zt.Emails').entries(emails.map((e) => ({ ...e, processed: false })));
  } else if (unread) {
    await UPDATE('zt.Emails').with({ processed: false });
  }
}

export async function resetAll() {
  for (const e of ['zt.ToolCalls', 'zt.ModelCalls', 'zt.Runs', 'zt.Decisions', 'zt.Playbooks', 'zt.Orders', 'zt.Replies', 'zt.A2ATasks']) {
    await DELETE.from(e);
  }
}

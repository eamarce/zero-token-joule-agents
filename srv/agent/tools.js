import cds from '@sap/cds';
import { tool } from '@langchain/core/tools';
import { checkOrder } from './check.js';

const { SELECT, INSERT } = cds.ql;

const DEFS = [
  {
    name: 'read_email',
    description: 'Read one email from the shared mailbox by its id (for example msg-1001). Returns sender, subject and body.',
    schema: {
      type: 'object',
      properties: { message_id: { type: 'string', description: 'The email id, like msg-1001' } },
      required: ['message_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'lookup_supplier',
    description: 'Find the supplier master record for an email domain, for example northwind-parts.example.',
    schema: {
      type: 'object',
      properties: { email_domain: { type: 'string' } },
      required: ['email_domain'],
      additionalProperties: false,
    },
  },
  {
    name: 'write_order',
    description: 'Create a purchase order in the ERP. Rejects a malformed order and says why.',
    schema: {
      type: 'object',
      properties: {
        supplier_id: { type: 'string' },
        order_no: { type: 'string', description: 'Like PO-12345' },
        order_date: { type: 'string', description: 'YYYY-MM-DD' },
        total: { type: 'number', description: 'Plain number, no thousands separator' },
        currency: { type: 'string', description: '3-letter code, like EUR' },
        source_message_id: { type: 'string' },
      },
      required: ['supplier_id', 'order_no', 'order_date', 'total', 'currency', 'source_message_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'draft_reply',
    description: 'Save a draft reply to an email for a person to review and send. Use for anything that is not an order.',
    schema: {
      type: 'object',
      properties: { message_id: { type: 'string' }, text: { type: 'string' } },
      required: ['message_id', 'text'],
      additionalProperties: false,
    },
  },
];

const IMPL = {
  async read_email({ message_id }) {
    const e = await SELECT.one.from('zt.Emails').columns('ID', 'sender', 'subject', 'body', 'received_at').where({ ID: message_id });
    if (!e) throw new Error(`no email with id ${message_id}`);
    return { message_id: e.ID, from: e.sender, subject: e.subject, body: e.body, received_at: e.received_at };
  },
  async lookup_supplier({ email_domain }) {
    const s = await SELECT.one.from('zt.Suppliers').where({ email_domain });
    if (!s) throw new Error(`no supplier for domain ${email_domain}`);
    return { supplier_id: s.ID, name: s.name };
  },
  async write_order(args, ctx) {
    const problems = checkOrder(args);
    if (problems.length) throw new Error(problems.join('; '));
    const supplier = await SELECT.one.from('zt.Suppliers').where({ ID: args.supplier_id });
    if (!supplier) throw new Error(`unknown supplier_id ${args.supplier_id}`);
    const ID = cds.utils.uuid();
    await INSERT.into('zt.Orders').entries({
      ID,
      supplier_id: args.supplier_id,
      order_no: args.order_no,
      order_date: args.order_date,
      total: args.total,
      currency: args.currency,
      source_message: args.source_message_id,
      run_ID: ctx.runId,
      created_at: new Date().toISOString(),
    });
    return { ok: true, order_id: ID };
  },
  async draft_reply({ message_id, text }, ctx) {
    const ID = cds.utils.uuid();
    await INSERT.into('zt.Replies').entries({ ID, message_id, text, run_ID: ctx.runId, created_at: new Date().toISOString() });
    return { ok: true, reply_id: ID };
  },
};

/**
 * The agent's tools, bound to one run. Every call, from the model or from a
 * playbook, is recorded in the same list, so a Type 1 run and a Type 3 run
 * leave the same kind of trace.
 */
export function createTools(runId) {
  const calls = [];
  const call = async (name, args) => {
    const started = Date.now();
    try {
      const output = await IMPL[name](args, { runId });
      calls.push({ name, input: args, output, error: null, duration_ms: Date.now() - started });
      return output;
    } catch (e) {
      calls.push({ name, input: args, output: null, error: e.message, duration_ms: Date.now() - started });
      throw e;
    }
  };
  const forModel = DEFS.map((d) =>
    tool(async (args) => JSON.stringify(await call(d.name, args)), { name: d.name, description: d.description, schema: d.schema }),
  );
  return { call, calls, forModel };
}

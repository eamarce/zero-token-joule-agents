/**
 * The simulated model. It lets the whole repository run with no API key.
 *
 * It is a set of hand-written rules that behave the way a capable model
 * behaves on this toy mailbox: it reads the email, looks up the supplier,
 * writes the order, and answers questions with a short reply. When asked to
 * write an extractor, it writes the kind of code a model plausibly writes from
 * a few examples, including the bug a model plausibly writes when none of the
 * examples had a thousands separator.
 *
 * Token counts in simulated mode are estimates (characters / 4) and every run
 * says so. They show the shape of the cost, not a price.
 */

const amount = (raw) => {
  // "1,250.00" -> 1250, "1.240,50" -> 1240.5, "980,00" -> 980
  const s = raw.trim();
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  const decimalSep = lastComma > lastDot ? ',' : '.';
  const thousandsSep = decimalSep === ',' ? '.' : ',';
  return Number(s.split(thousandsSep).join('').replace(decimalSep, '.'));
};

/** What "the model" understands from an order email. null if it is not an order. */
export function readOrder(body) {
  const nw = {
    no: body.match(/Order number:\s*(PO-\d+)/),
    date: body.match(/Order date:\s*(\d{4}-\d{2}-\d{2})/),
    total: body.match(/Total:\s*([\d.,]+)\s*([A-Z]{3})/),
  };
  if (nw.no && nw.date && nw.total) {
    return { order_no: nw.no[1], order_date: nw.date[1], total: amount(nw.total[1]), currency: nw.total[2] };
  }
  const cm = {
    no: body.match(/ref\.\s*PO\s*(\d+)/i),
    date: body.match(/dated\s*(\d{2})\.(\d{2})\.(\d{4})/),
    total: body.match(/amount\s*([A-Z]{3})\s*([\d.,]+\d)/),
  };
  if (cm.no && cm.date && cm.total) {
    return {
      order_no: `PO-${cm.no[1]}`,
      order_date: `${cm.date[3]}-${cm.date[2]}-${cm.date[1]}`,
      total: amount(cm.total[2]),
      currency: cm.total[1],
    };
  }
  return null;
}

function draftReply(email) {
  const name = email.body.match(/\n\s*([A-Z][a-z]+)\s*$/)?.[1];
  return `${name ? `Hi ${name},` : 'Hello,'}\n\nthanks for your message about "${email.subject}". A colleague will check and get back to you today.\n\nBest regards,\nPurchasing`;
}

const toolResults = (messages) => {
  const out = {};
  for (const m of messages) {
    if (m.type === 'tool') {
      let value;
      try {
        value = JSON.parse(m.content);
      } catch {
        value = { error: String(m.content) };
      }
      out[m.name] = value;
    }
  }
  return out;
};

/**
 * One step of the explore agent: look at what has happened so far and pick
 * the next tool call, or finish. Returns { text, toolCall } where toolCall is
 * { name, args } or null.
 */
export function nextStep(messages) {
  const request = messages.find((m) => m.type === 'human')?.content ?? '';
  const messageId = String(request).match(/msg-\d+/)?.[0];
  const r = toolResults(messages);

  if (!r.read_email) return { text: 'I will read the email first.', toolCall: { name: 'read_email', args: { message_id: messageId } } };
  if (r.read_email.error) return { text: `I could not read ${messageId}: ${r.read_email.error}`, toolCall: null };

  const email = r.read_email;
  const order = readOrder(email.body);
  if (!order) {
    if (!r.draft_reply) {
      return {
        text: 'This is a question, not an order. I will draft a reply.',
        toolCall: { name: 'draft_reply', args: { message_id: email.message_id, text: draftReply(email) } },
      };
    }
    return { text: 'Drafted a reply for a person to send.', toolCall: null };
  }
  if (!r.lookup_supplier) {
    const domain = email.from.split('@')[1];
    return { text: 'It is an order. I will look up the supplier.', toolCall: { name: 'lookup_supplier', args: { email_domain: domain } } };
  }
  if (r.lookup_supplier.error) return { text: `Unknown supplier: ${r.lookup_supplier.error}`, toolCall: null };
  if (!r.write_order) {
    return {
      text: 'I have what I need. Writing the order.',
      toolCall: {
        name: 'write_order',
        args: { supplier_id: r.lookup_supplier.supplier_id, ...order, source_message_id: email.message_id },
      },
    };
  }
  if (r.write_order.error) return { text: `The order was rejected: ${r.write_order.error}`, toolCall: null };
  return { text: `Order ${order.order_no} written for ${r.lookup_supplier.name}.`, toolCall: null };
}

/** Type 2: the narrow job left for the model inside a playbook. */
export function interpret(email) {
  return readOrder(email.body);
}

/**
 * Write a candidate extractor from examples, the way a model does: it
 * generalises from what it has seen. If none of the examples had a thousands
 * separator, the number parsing it writes does not handle one.
 */
export function writeExtractor(examples) {
  const bodies = examples.map((e) => e.input.body);
  if (bodies.length && bodies.every((b) => /Our ref\. PO/.test(b))) {
    // Plausible model code for the Contoso template. It treats the comma as the
    // decimal mark and forgets that a dot can be the thousands mark: "1.240,50"
    // becomes NaN. The backtest is there to catch exactly this.
    return `// Candidate extractor for Contoso Metalworks order emails.
// Written from ${examples.length} past runs. Runs in a sandbox: no require, no I/O.
function extract(input) {
  const body = String(input.body || '');
  const ref = body.match(/ref\\.\\s*PO\\s*(\\d+)/i);
  const date = body.match(/dated\\s*(\\d{2})\\.(\\d{2})\\.(\\d{4})/);
  const m = body.match(/amount\\s*([A-Z]{3})\\s*([\\d.,]+\\d)/);
  if (!ref || !date || !m) return null;
  return {
    order_no: 'PO-' + ref[1],
    order_date: date[3] + '-' + date[2] + '-' + date[1],
    total: Number(m[2].replace(',', '.')),
    currency: m[1],
  };
}
`;
  }
  if (!bodies.every((b) => /Order number:/.test(b) && /Total:/.test(b))) return null;
  const sawSeparator = bodies.some((b) => /Total:\s*\d{1,3}(,\d{3})+\./.test(b));
  const total = sawSeparator ? "Number(m[1].replace(/,/g, ''))" : 'parseFloat(m[1])';
  return `// Candidate extractor for Northwind Parts order emails.
// Written from ${examples.length} past runs. Runs in a sandbox: no require, no I/O.
function extract(input) {
  const body = String(input.body || '');
  const no = body.match(/Order number:\\s*(PO-\\d+)/);
  const date = body.match(/Order date:\\s*(\\d{4}-\\d{2}-\\d{2})/);
  const m = body.match(/Total:\\s*([\\d.,]+)\\s*([A-Z]{3})/);
  if (!no || !date || !m) return null;
  return {
    order_no: no[1],
    order_date: date[1],
    total: ${total},
    currency: m[2],
  };
}
`;
}

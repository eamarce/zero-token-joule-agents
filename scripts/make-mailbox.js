// Writes data/mailbox.json: the synthetic mailbox the agent works through.
//
//   node scripts/make-mailbox.js
//
// Everything here is invented and uses the reserved .example domain. The order
// of the emails is chosen so that, with the demo thresholds (config/profiles.json),
// one pass shows the whole cycle from the talk: explore, propose, gate 1,
// a signature, zero-token runs, a silent drift (totals with a thousands
// separator), a failed re-check, demotion, and a second proposal.
import { writeFileSync } from 'node:fs';

const suppliers = [
  { ID: 'SUP-NW', name: 'Northwind Parts', email_domain: 'northwind-parts.example' },
  { ID: 'SUP-CM', name: 'Contoso Metalworks', email_domain: 'contoso-metal.example' },
];

let po = 10432;
const nw = (total, date) => {
  const order_no = `PO-${po++}`;
  return {
    sender: 'orders@northwind-parts.example',
    subject: `New order ${order_no}`,
    body: `Hello,\n\nplease find our order below.\n\nOrder number: ${order_no}\nOrder date: ${date}\nTotal: ${total} EUR\n\nKind regards,\nNorthwind Parts, order desk`,
    expected: {
      task: 'parse_order_email',
      supplier_id: 'SUP-NW',
      order_no,
      order_date: date,
      total: Number(total.replace(/,/g, '')),
      currency: 'EUR',
    },
  };
};

let ref = 7781;
const cm = (amount, dmy) => {
  const n = ref++;
  const [d, m, y] = dmy.split('.');
  return {
    sender: 'sales@contoso-metal.example',
    subject: `Bestellung / order ${n}`,
    body: `Dear customer,\n\nOur ref. PO ${n}, dated ${dmy}, amount EUR ${amount}.\nPlease confirm by return.\n\nContoso Metalworks`,
    expected: {
      task: 'parse_order_email',
      supplier_id: 'SUP-CM',
      order_no: `PO-${n}`,
      order_date: `${y}-${m}-${d}`,
      total: Number(amount.replace(/\./g, '').replace(',', '.')),
      currency: 'EUR',
    },
  };
};

const question = (sender, subject, body) => ({ sender, subject, body, expected: { task: 'reply_to_supplier' } });

const fb = (subject, body) => question('buyer@fabrikam.example', subject, body);

const sequence = [
  nw('412.50', '2026-10-01'),
  nw('88.00', '2026-10-01'),
  nw('260.75', '2026-10-02'),
  fb('Delivery before Friday?', 'Hi,\n\ncould you tell me whether order 55 can ship before Friday?\n\nThanks,\nDana'),
  nw('145.20', '2026-10-02'),
  nw('99.90', '2026-10-03'),
  cm('980,00', '03.10.2026'),
  nw('310.00', '2026-10-03'),
  nw('57.40', '2026-10-04'),
  nw('640.00', '2026-10-04'),
  nw('120.00', '2026-10-05'),
  nw('75.25', '2026-10-05'),
  question(
    'orders@northwind-parts.example',
    'Delivery address',
    'Hello,\n\nquick question about Order number: PO-10498.\nCan you confirm the delivery address for next week?\n\nNorthwind Parts, order desk',
  ),
  nw('430.10', '2026-10-06'),
  nw('205.00', '2026-10-06'),
  nw('1,250.00', '2026-10-07'),
  fb('Invoice copy', 'Hello,\n\ncan you send me a copy of last month\'s invoice?\n\nDana'),
  nw('66.60', '2026-10-07'),
  nw('2,480.00', '2026-10-08'),
  nw('3,105.50', '2026-10-08'),
  cm('1.240,50', '08.10.2026'),
  nw('92.00', '2026-10-09'),
  nw('1,999.99', '2026-10-09'),
  nw('512.00', '2026-10-10'),
  nw('4,020.00', '2026-10-10'),
  nw('1,140.00', '2026-10-11'),
  nw('230.00', '2026-10-11'),
  nw('1,375.25', '2026-10-12'),
  fb('Price list', 'Hi,\n\nis there an updated price list for Q4?\n\nDana'),
  nw('84.00', '2026-10-12'),
  nw('2,210.00', '2026-10-13'),
  nw('305.60', '2026-10-13'),
  nw('1,050.00', '2026-10-14'),
  nw('49.95', '2026-10-14'),
  nw('760.00', '2026-10-15'),
  nw('3,300.00', '2026-10-15'),
  cm('615,00', '15.10.2026'),
  nw('128.40', '2026-10-16'),
  nw('1,600.00', '2026-10-16'),
  nw('97.10', '2026-10-17'),
];

const start = Date.parse('2026-10-01T07:00:00Z');
const emails = sequence.map((e, i) => ({
  ID: `msg-${1001 + i}`,
  seq: i + 1,
  sender: e.sender,
  subject: e.subject,
  body: e.body,
  received_at: new Date(start + i * 3 * 3600_000).toISOString(),
  expected_json: JSON.stringify(e.expected),
}));

const url = new URL('../data/mailbox.json', import.meta.url);
writeFileSync(url, `${JSON.stringify({ suppliers, emails }, null, 2)}\n`);
console.log(`wrote ${emails.length} emails to data/mailbox.json`);

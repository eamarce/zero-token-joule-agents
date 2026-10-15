import { isDeepStrictEqual } from 'node:util';
import { CONTRACTS } from './config.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The output check for an order: shape only. It catches an extractor that
 * returns nothing or garbage. It does not catch a plausible wrong number,
 * which is why frozen runs are also re-checked against the model.
 */
export function checkOrder(fields) {
  const problems = [];
  if (!fields || typeof fields !== 'object') return ['no result'];
  if (typeof fields.order_no !== 'string' || !/^PO-\d+$/.test(fields.order_no)) problems.push('order_no must look like PO-12345');
  if (typeof fields.order_date !== 'string' || !ISO_DATE.test(fields.order_date) || Number.isNaN(Date.parse(fields.order_date))) {
    problems.push('order_date must be an ISO date (YYYY-MM-DD)');
  }
  if (typeof fields.total !== 'number' || !Number.isFinite(fields.total) || fields.total <= 0) problems.push('total must be a positive number');
  if (typeof fields.currency !== 'string' || !/^[A-Z]{3}$/.test(fields.currency)) problems.push('currency must be a 3-letter code');
  return problems;
}

/** Keep only the contract fields, normalised, so two answers can be compared. */
export function answerOf(fields, task = 'parse_order_email') {
  if (!fields) return null;
  const out = {};
  for (const k of CONTRACTS[task].fields) out[k] = fields[k] ?? null;
  if (typeof out.total === 'string') out.total = Number(out.total);
  if (typeof out.total === 'number') out.total = Math.round(out.total * 100) / 100;
  return out;
}

export const sameAnswer = (a, b) => isDeepStrictEqual(answerOf(a), answerOf(b));

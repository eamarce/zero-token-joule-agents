export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const byTime = (a, b) => Date.parse(a.started_at) - Date.parse(b.started_at);

export function group(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return m;
}

/** Parse JSONL text. Returns { records, errors } so callers can report every bad line. */
export function parseJsonl(text) {
  const records = [];
  const errors = [];
  String(text)
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (!line.trim()) return;
      try {
        records.push({ line: i + 1, value: JSON.parse(line) });
      } catch (e) {
        errors.push({ line: i + 1, message: `invalid JSON: ${e.message}` });
      }
    });
  return { records, errors };
}

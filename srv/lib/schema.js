import { readFileSync } from 'node:fs';

/**
 * A small JSON Schema validator covering the subset the run-log schema uses:
 * type (incl. arrays of types), enum, const, required, properties,
 * additionalProperties:false, items, minLength, minItems, minimum, pattern,
 * format:"date-time", and local $ref to #/$defs/*.
 * It is not a full implementation. Use Ajv if you need the whole spec.
 */
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v; // 'number' | 'string' | 'boolean' | 'object'
}

function matchesType(v, t) {
  const actual = typeOf(v);
  return actual === t || (t === 'number' && actual === 'integer');
}

export function validate(value, schema, root = schema, path = '$') {
  if (schema.$ref) {
    const target = schema.$ref.replace('#/', '').split('/').reduce((o, k) => o?.[k], root);
    if (!target) return [{ path, message: `unresolved $ref ${schema.$ref}` }];
    return validate(value, target, root, path);
  }
  const errors = [];
  const fail = (message) => errors.push({ path, message });

  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((t) => matchesType(value, t))) {
      fail(`expected ${types.join(' or ')}, got ${typeOf(value)}`);
      return errors;
    }
  }
  if ('const' in schema && value !== schema.const) fail(`must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) fail(`must be one of ${JSON.stringify(schema.enum)}`);

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail(`shorter than ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail(`does not match ${schema.pattern}`);
    if (schema.format === 'date-time' && (!DATE_TIME.test(value) || Number.isNaN(Date.parse(value)))) {
      fail('not an RFC 3339 date-time');
    }
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    fail(`below minimum ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`fewer than ${schema.minItems} items`);
    if (schema.items) {
      value.forEach((item, i) => errors.push(...validate(item, schema.items, root, `${path}[${i}]`)));
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push({ path: `${path}.${key}`, message: 'required' });
    }
    const props = schema.properties ?? {};
    for (const [key, sub] of Object.entries(props)) {
      if (key in value) errors.push(...validate(value[key], sub, root, `${path}.${key}`));
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) errors.push({ path: `${path}.${key}`, message: 'unknown property' });
      }
    }
  }
  return errors;
}

export function loadSchema(url) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

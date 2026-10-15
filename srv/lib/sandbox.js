import vm from 'node:vm';

/**
 * Run model-written code in a fresh node:vm context.
 *
 * THIS IS NOT A SECURITY BOUNDARY. node:vm separates globals, not privileges.
 * Hostile code can escape it, and the timeout does not cover everything. What
 * it gives you here is a clean namespace (no require, no process, no fs),
 * a time limit, and a JSON-only interface, which is enough to teach the gate
 * logic and to catch honest mistakes. For real use, run the code in a
 * container with no network, a read-only filesystem and CPU/memory limits.
 * See docs/gates.md.
 *
 * Contract: the source defines `function extract(input)`. Input and output
 * cross the boundary as JSON strings so no object from the host realm is
 * ever handed to the guest.
 */
export function loadExtractor(source, { timeoutMs = 1000 } = {}) {
  const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(source, context, { timeout: timeoutMs, filename: 'extractor.js' });
  if (vm.runInContext('typeof extract', context) !== 'function') {
    throw new Error('extractor source must define a function named extract');
  }
  return (input) => {
    context.__in = JSON.stringify(input);
    const out = vm.runInContext('JSON.stringify(extract(JSON.parse(__in)))', context, { timeout: timeoutMs });
    return out === undefined ? undefined : JSON.parse(out);
  };
}

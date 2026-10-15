// The real-model path, checked without a network call: a fake fetch answers in
// the shape of each provider's API, and the test looks at what was sent and
// at what the agent made of the answers. No API key, no cost.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tool } from '@langchain/core/tools';
import { createModel } from '../srv/agent/models.js';
import { modelConfig } from '../srv/agent/config.js';
import { explore } from '../srv/agent/graph.js';

const saved = { ...process.env };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ['ZT_MODEL_PROVIDER', 'ZT_MODEL', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY']) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function fakeFetch(replies) {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    const reply = replies[requests.length - 1];
    if (!reply) throw new Error('no more fake replies');
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, requests };
}

const tools = () => {
  const calls = [];
  const make = (name, result) =>
    tool(
      async (args) => {
        calls.push({ name, args });
        return JSON.stringify(result);
      },
      { name, description: name, schema: { type: 'object', properties: {}, additionalProperties: true } },
    );
  return { calls, list: [make('read_email', { message_id: 'msg-1', body: 'Order number: PO-1' }), make('write_order', { ok: true })] };
};

const anthropicMessage = (content, stop, usage) => ({
  id: `msg_${Math.random()}`,
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content,
  stop_reason: stop,
  stop_sequence: null,
  usage,
});

test('Anthropic: tool loop through LangGraph, default model, no sampling params, usage recorded', async () => {
  process.env.ZT_MODEL_PROVIDER = 'anthropic';
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const { fetch, requests } = fakeFetch([
    anthropicMessage([{ type: 'tool_use', id: 'tu_1', name: 'read_email', input: { message_id: 'msg-1' } }], 'tool_use', { input_tokens: 900, output_tokens: 40 }),
    anthropicMessage([{ type: 'tool_use', id: 'tu_2', name: 'write_order', input: { order_no: 'PO-1' } }], 'tool_use', { input_tokens: 1100, output_tokens: 60 }),
    anthropicMessage([{ type: 'text', text: 'Order PO-1 written.' }], 'end_turn', { input_tokens: 1200, output_tokens: 10 }),
  ]);
  const model = await createModel({ fetch });
  assert.equal(model.model, 'claude-opus-5-5');
  const t = tools();
  const messages = await explore(model, t.list, 'msg-1');

  assert.deepEqual(t.calls.map((c) => c.name), ['read_email', 'write_order']);
  assert.equal(requests.length, 3);
  const first = requests[0].body;
  assert.equal(first.model, 'claude-opus-5-5');
  for (const k of ['temperature', 'top_k', 'top_p', 'thinking']) assert.ok(!(k in first), `${k} must not be sent to this model`);
  assert.deepEqual(first.tools.map((x) => x.name), ['read_email', 'write_order']);
  assert.match(JSON.stringify(first.system), /purchasing team/);
  assert.ok(requests[1].body.messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result' && b.tool_use_id === 'tu_1')), 'tool result goes back to the model');

  const ai = messages.filter((m) => m.type === 'ai');
  assert.equal(ai.length, 3);
  assert.deepEqual(ai.map((m) => m.usage_metadata.input_tokens), [900, 1100, 1200]);
});

test('Anthropic: interpret parses JSON, writeExtractor returns only code', async () => {
  process.env.ZT_MODEL_PROVIDER = 'anthropic';
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const { fetch } = fakeFetch([
    anthropicMessage([{ type: 'text', text: '{"order_no":"PO-9","order_date":"2026-10-01","total":1250,"currency":"EUR"}' }], 'end_turn', { input_tokens: 200, output_tokens: 30 }),
    anthropicMessage([{ type: 'text', text: 'Here it is:\n```js\nfunction extract(input) { return null; }\n```' }], 'end_turn', { input_tokens: 800, output_tokens: 90 }),
  ]);
  const model = await createModel({ fetch });
  const read = await model.interpret({ subject: 's', body: 'b' });
  assert.deepEqual(read.fields, { order_no: 'PO-9', order_date: '2026-10-01', total: 1250, currency: 'EUR' });
  assert.deepEqual(read.usage, { input: 200, output: 30 });
  const code = await model.writeExtractor([{ input: { body: 'x' }, expected: {} }]);
  assert.equal(code.source, 'function extract(input) { return null; }\n');
});

test('OpenAI: same loop through Chat Completions, default model gpt-5.4-mini', async () => {
  process.env.ZT_MODEL_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-key';
  const completion = (message, finish, usage) => ({
    id: `chatcmpl-${Math.random()}`,
    object: 'chat.completion',
    created: 1790000000,
    model: 'gpt-5.4-mini',
    choices: [{ index: 0, message, finish_reason: finish }],
    usage,
  });
  const call = (id, name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
  const { fetch, requests } = fakeFetch([
    completion(call('c1', 'read_email', { message_id: 'msg-1' }), 'tool_calls', { prompt_tokens: 700, completion_tokens: 20, total_tokens: 720 }),
    completion(call('c2', 'write_order', { order_no: 'PO-1' }), 'tool_calls', { prompt_tokens: 800, completion_tokens: 30, total_tokens: 830 }),
    completion({ role: 'assistant', content: 'Order PO-1 written.' }, 'stop', { prompt_tokens: 850, completion_tokens: 8, total_tokens: 858 }),
  ]);
  const model = await createModel({ fetch });
  assert.equal(model.model, 'gpt-5.4-mini');
  const t = tools();
  const messages = await explore(model, t.list, 'msg-1');
  assert.deepEqual(t.calls.map((c) => c.name), ['read_email', 'write_order']);
  assert.match(requests[0].url, /\/chat\/completions$/);
  assert.equal(requests[0].body.model, 'gpt-5.4-mini');
  assert.deepEqual(messages.filter((m) => m.type === 'ai').map((m) => m.usage_metadata.input_tokens), [700, 800, 850]);
});

test('Google: same loop through generateContent, default model gemini-3.8-flash, key from GEMINI_API_KEY', async () => {
  process.env.ZT_MODEL_PROVIDER = 'google';
  process.env.GEMINI_API_KEY = 'test-key';
  const reply = (parts, usage) => ({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP', index: 0 }], usageMetadata: usage });
  const usage = (p, c) => ({ promptTokenCount: p, candidatesTokenCount: c, totalTokenCount: p + c });
  const { fetch, requests } = fakeFetch([
    reply([{ functionCall: { name: 'read_email', args: { message_id: 'msg-1' } } }], usage(650, 15)),
    reply([{ functionCall: { name: 'write_order', args: { order_no: 'PO-1' } } }], usage(780, 25)),
    reply([{ text: 'Order PO-1 written.' }], usage(820, 7)),
  ]);
  // The Google SDK has no fetch option: it calls the global one.
  globalThis.fetch = fetch;
  const model = await createModel();
  assert.equal(model.provider, 'google');
  assert.equal(model.model, 'gemini-3.8-flash');
  const t = tools();
  const messages = await explore(model, t.list, 'msg-1');

  assert.deepEqual(t.calls.map((c) => c.name), ['read_email', 'write_order']);
  assert.equal(requests.length, 3);
  assert.match(requests[0].url, /models\/gemini-3\.8-flash:generateContent/);
  assert.match(JSON.stringify(requests[0].body), /purchasing team/);
  assert.deepEqual(requests[0].body.tools[0].functionDeclarations.map((x) => x.name), ['read_email', 'write_order']);
  assert.ok(requests[1].body.contents.some((c) => c.parts?.some((p) => p.functionResponse?.name === 'read_email')), 'tool result goes back to the model');
  assert.deepEqual(messages.filter((m) => m.type === 'ai').map((m) => m.usage_metadata.input_tokens), [650, 780, 820]);
});

test('provider is picked from whichever key is set: Anthropic, then OpenAI, then Google', () => {
  for (const k of ['ZT_MODEL_PROVIDER', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY']) delete process.env[k];
  assert.equal(modelConfig().provider, 'simulated');
  process.env.GOOGLE_API_KEY = 'k';
  assert.equal(modelConfig().provider, 'google');
  process.env.OPENAI_API_KEY = 'k';
  assert.equal(modelConfig().provider, 'openai');
  process.env.ANTHROPIC_API_KEY = 'k';
  assert.equal(modelConfig().provider, 'anthropic');
});

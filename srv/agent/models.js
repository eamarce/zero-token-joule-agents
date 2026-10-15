import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { modelConfig } from './config.js';
import * as sim from './simulated.js';

export const EXPLORE_PROMPT = `You process emails in a purchasing team's shared mailbox.
For an order email: read it, look up the supplier by the domain of the sender's address, then write the order.
Write order_no like PO-12345, order_date as YYYY-MM-DD, total as a plain number, currency as a 3-letter code.
For any other email: read it and draft a short, polite reply for a person to review. Do not invent facts.
Use the tools. Finish with one sentence that says what you did.`;

const INTERPRET_PROMPT = `Extract the order from this supplier email.
Answer with JSON only, in this shape: {"order_no": "PO-12345", "order_date": "YYYY-MM-DD", "total": 1234.5, "currency": "EUR"}
total is a plain number with no thousands separator. If the email is not an order, answer with: null`;

const EXTRACTOR_PROMPT = `Write a JavaScript function named extract(input) for this kind of email.
input is { from, subject, body }. Return { order_no, order_date, total, currency } exactly like the examples, or null when the email is not an order in this format.
Rules: plain JavaScript, no require or import, no I/O, no network, no randomness, no dates from the clock.
Answer with the code only.`;

const estimate = (text) => Math.ceil(String(text ?? '').length / 4);

const usageOf = (msg) => ({
  input: msg?.usage_metadata?.input_tokens ?? 0,
  output: msg?.usage_metadata?.output_tokens ?? 0,
});

/** The text of a model reply, ignoring thinking blocks. */
export function textOf(msg) {
  if (typeof msg?.content === 'string') return msg.content;
  return (msg?.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function parseJsonAnswer(text) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  if (/^null\.?$/i.test(t)) return null;
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

function codeOf(text) {
  const fenced = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
  const code = (fenced ? fenced[1] : text).trim();
  return /function\s+extract\s*\(/.test(code) ? `${code}\n` : null;
}

// `fetch` is only passed by tests, to check the wiring without a network call.
// The Google SDK takes no fetch option and calls the global one, so its test replaces globalThis.fetch.
async function chatModel(cfg, fetch) {
  if (cfg.provider === 'anthropic') {
    const { ChatAnthropic } = await import('@langchain/anthropic');
    return new ChatAnthropic({
      model: cfg.model,
      maxTokens: 16000,
      ...(cfg.effort ? { outputConfig: { effort: cfg.effort } } : {}),
      ...(fetch ? { clientOptions: { fetch } } : {}),
    });
  }
  if (cfg.provider === 'google') {
    const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
    return new ChatGoogleGenerativeAI({ model: cfg.model, maxOutputTokens: 16000 });
  }
  const { ChatOpenAI } = await import('@langchain/openai');
  return new ChatOpenAI({ model: cfg.model, ...(fetch ? { configuration: { fetch } } : {}) });
}

/**
 * One interface for the three ways the agent uses a model:
 *   agentStep   - Type 3: decide the next tool call while exploring
 *   interpret   - Type 2: the narrow job inside a playbook (read the fields)
 *   writeExtractor - propose code from past runs (cost is logged, outside any run)
 * Each returns usage { input, output } so every token ends up in the log.
 */
export async function createModel({ fetch } = {}) {
  const cfg = modelConfig();

  if (cfg.provider === 'simulated') {
    return {
      ...cfg,
      async agentStep(messages, tools) {
        const step = sim.nextStep(messages);
        const prompt = EXPLORE_PROMPT + JSON.stringify(tools.map((t) => [t.name, t.description, t.schema])) + messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
        const toolCalls = step.toolCall ? [{ ...step.toolCall, id: `call_${Math.random().toString(36).slice(2, 10)}`, type: 'tool_call' }] : [];
        const usage = { input: estimate(prompt), output: estimate(step.text + JSON.stringify(step.toolCall ?? '')) };
        return new AIMessage({
          content: step.text,
          tool_calls: toolCalls,
          usage_metadata: { input_tokens: usage.input, output_tokens: usage.output, total_tokens: usage.input + usage.output },
        });
      },
      async interpret(email) {
        const fields = sim.interpret(email);
        return { fields, usage: { input: estimate(INTERPRET_PROMPT + email.body), output: estimate(JSON.stringify(fields)) } };
      },
      async writeExtractor(examples) {
        const source = sim.writeExtractor(examples);
        return { source, usage: { input: estimate(EXTRACTOR_PROMPT + JSON.stringify(examples)), output: estimate(source ?? 'null') } };
      },
    };
  }

  const chat = await chatModel(cfg, fetch);
  return {
    ...cfg,
    async agentStep(messages, tools) {
      const reply = await chat.bindTools(tools).invoke([new SystemMessage(EXPLORE_PROMPT), ...messages]);
      return reply;
    },
    async interpret(email) {
      const reply = await chat.invoke([new SystemMessage(INTERPRET_PROMPT), new HumanMessage(`Subject: ${email.subject}\n\n${email.body}`)]);
      return { fields: parseJsonAnswer(textOf(reply)), usage: usageOf(reply) };
    },
    async writeExtractor(examples) {
      const shown = examples.map((e, i) => `Example ${i + 1}\ninput: ${JSON.stringify(e.input)}\nexpected: ${JSON.stringify(e.expected)}`).join('\n\n');
      const reply = await chat.invoke([new SystemMessage(EXTRACTOR_PROMPT), new HumanMessage(shown)]);
      return { source: codeOf(textOf(reply)), usage: usageOf(reply) };
    },
  };
}

export { usageOf };

import { readFileSync } from 'node:fs';

const PROFILES = JSON.parse(readFileSync(new URL('../../config/profiles.json', import.meta.url), 'utf8'));

/** Thresholds for proposing, promoting and re-checking. ZT_PROFILE=demo|talk (default demo). */
export function profile() {
  const name = process.env.ZT_PROFILE ?? 'demo';
  const p = PROFILES[name];
  if (!p) throw new Error(`unknown ZT_PROFILE "${name}"; use one of ${Object.keys(PROFILES).join(', ')}`);
  return { name, ...p };
}

const DEFAULT_MODELS = { anthropic: 'claude-opus-5-5', openai: 'gpt-5.4-mini', google: 'gemini-3.8-flash', simulated: 'simulated' };

/**
 * Which model runs the agent.
 *   ZT_MODEL_PROVIDER = anthropic | openai | google | simulated
 *   default: anthropic if ANTHROPIC_API_KEY is set, else openai if OPENAI_API_KEY is set,
 *   else google if GOOGLE_API_KEY (or GEMINI_API_KEY) is set, else simulated.
 *   ZT_MODEL overrides the model id. ZT_EFFORT (low|medium|high) is passed to Anthropic models that accept it.
 */
export function modelConfig() {
  const provider =
    process.env.ZT_MODEL_PROVIDER ??
    (process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.OPENAI_API_KEY ? 'openai' : process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY ? 'google' : 'simulated');
  if (!DEFAULT_MODELS[provider]) throw new Error(`unknown ZT_MODEL_PROVIDER "${provider}"`);
  return {
    provider,
    model: process.env.ZT_MODEL ?? DEFAULT_MODELS[provider],
    effort: process.env.ZT_EFFORT,
    estimated: provider === 'simulated',
  };
}

/** Tasks the crystallizer may turn into code, with the fields that make up the answer. */
export const CONTRACTS = {
  parse_order_email: {
    from: 'read_email',
    to: 'write_order',
    fields: ['order_no', 'order_date', 'total', 'currency'],
  },
  // reply_to_supplier has no contract on purpose: a free-text reply has no
  // single right answer to test against, so it stays with the model.
};

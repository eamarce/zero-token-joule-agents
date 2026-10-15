import cds from '@sap/cds';
import { processMessage, processNext } from './agent/engine.js';
import { computeRatio } from './agent/ratio.js';

const { SELECT, INSERT } = cds.ql;

/**
 * A2A 0.3, the minimum Joule needs: an agent card, JSON-RPC message/send
 * (answered synchronously) and tasks/get. Joule gives a synchronous
 * agent-request about 60 seconds; one email takes well under that.
 */
export function agentCard(baseUrl) {
  const base = String(baseUrl).replace(/\/$/, '');
  return {
    protocolVersion: '0.3.0',
    name: 'Zero-token order email agent',
    description:
      'Processes supplier emails: writes purchase orders and drafts replies. Repeated cases run on playbooks a person signed, with no model call. Reports its Type 1 : 2 : 3 ratio.',
    url: `${base}/a2a`,
    preferredTransport: 'JSONRPC',
    version: '0.2.0',
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain', 'application/json'],
    securitySchemes: {
      oauth2: { type: 'oauth2', description: 'SAP XSUAA OAuth2 client credentials with the AgentCaller scope' },
    },
    security: [{ oauth2: ['AgentCaller'] }],
    skills: [
      {
        id: 'process_supplier_email',
        name: 'Process supplier email',
        description: 'Process the next email in the purchasing mailbox, or one email by id, and say how it was handled (explored, playbook, or signed code).',
        tags: ['purchasing', 'orders', 'email'],
        examples: ['Process the next supplier email', 'Process email msg-1007', 'What is the run ratio?'],
      },
    ],
  };
}

const ERR = { PARSE: -32700, INVALID: -32600, METHOD: -32601, PARAMS: -32602, INTERNAL: -32603, NOT_FOUND: -32001, AUTH: -32003 };
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

const TYPE_TEXT = { 1: 'Type 1, signed code, no model', 2: 'Type 2, playbook with the model reading the fields', 3: 'Type 3, the agent explored' };

function textFor(result) {
  const lines = [
    `${result.messageId}: ${result.summary}`,
    `${TYPE_TEXT[result.runType]}, ${result.tokens.toLocaleString('en-US')} tokens${result.estimated ? ' (estimated)' : ''}.`,
    ...result.events.map((e) => `- ${e}`),
    `Type 1 : 2 : 3 so far = ${result.ratio}`,
  ];
  return lines.join('\n');
}

async function answer(text) {
  if (/\b(ratio|status|how many|cuánt|proporci)/i.test(text)) {
    const r = await computeRatio();
    return {
      text: `Type 1 : 2 : 3 = ${r.ratio} over ${r.total} runs, ${r.allTokens.toLocaleString('en-US')} tokens in runs and ${r.proposalTokens.toLocaleString('en-US')} spent writing candidate code.`,
      data: r,
    };
  }
  const id = text.match(/msg-\d+/i)?.[0]?.toLowerCase();
  const result = id ? await processMessage(id) : await processNext();
  return { text: textFor(result), data: result, runId: result.runId };
}

function taskObject(row, data) {
  return {
    kind: 'task',
    id: row.ID,
    contextId: row.context_id,
    status: {
      state: row.state,
      message: {
        kind: 'message',
        role: 'agent',
        messageId: `status-${row.ID}`,
        taskId: row.ID,
        contextId: row.context_id,
        // Joule functions read status.message.parts[0].text.
        parts: [{ kind: 'text', text: row.response_text }],
      },
      timestamp: row.created_at,
    },
    artifacts: data ? [{ artifactId: `result-${row.ID}`, name: 'result', parts: [{ kind: 'data', data }] }] : [],
  };
}

async function messageSend(params, caller) {
  const parts = params?.message?.parts ?? [];
  const text = parts
    .filter((p) => p.kind === 'text' || p.type === 'text')
    .map((p) => p.text)
    .join(' ')
    .trim();
  const row = {
    ID: cds.utils.uuid(),
    context_id: params?.message?.contextId ?? cds.utils.uuid(),
    request_text: text,
    caller,
    created_at: new Date().toISOString(),
  };
  let data = null;
  try {
    const a = await answer(text || 'next');
    Object.assign(row, { state: 'completed', response_text: a.text, run_id: a.runId ?? null });
    data = a.data;
  } catch (e) {
    Object.assign(row, { state: 'failed', response_text: `I could not do that: ${e.message}` });
  }
  await INSERT.into('zt.A2ATasks').entries(row);
  return taskObject(row, data);
}

async function tasksGet(params) {
  const row = await SELECT.one.from('zt.A2ATasks').where({ ID: params?.id });
  return row ? taskObject(row, null) : null;
}

async function readJson(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Express handler, mounted after CAP's auth middlewares. */
export async function handleA2A(req, res) {
  const user = cds.context?.user;
  if (!user?.is('AgentCaller')) {
    const authenticated = user?.id && user.id !== 'anonymous';
    // In development (mocked users) ask the browser for basic auth, as CAP does for OData.
    if (!authenticated && ['mocked', 'basic'].includes(cds.env.requires?.auth?.kind)) res.set('WWW-Authenticate', 'Basic realm="Users"');
    return res.status(authenticated ? 403 : 401).json(rpcError(null, ERR.AUTH, 'Not authorized'));
  }
  let body = req.body;
  if (body === undefined) {
    try {
      body = await readJson(req);
    } catch {
      return res.status(400).json(rpcError(null, ERR.PARSE, 'Parse error'));
    }
  }
  if (!body || typeof body !== 'object' || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return res.status(400).json(rpcError(body?.id, ERR.INVALID, 'Invalid JSON-RPC request'));
  }
  try {
    if (body.method === 'message/send') {
      return res.json({ jsonrpc: '2.0', id: body.id, result: await cds.tx(() => messageSend(body.params, user.id)) });
    }
    if (body.method === 'tasks/get') {
      const task = await cds.tx(() => tasksGet(body.params));
      return task ? res.json({ jsonrpc: '2.0', id: body.id, result: task }) : res.json(rpcError(body.id, ERR.NOT_FOUND, 'Task not found'));
    }
    return res.json(rpcError(body.id, ERR.METHOD, `Method not found: ${body.method}`));
  } catch (e) {
    cds.log('a2a').error(e);
    return res.status(500).json(rpcError(body.id, ERR.INTERNAL, 'Internal error'));
  }
}

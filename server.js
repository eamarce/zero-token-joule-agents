import cds from '@sap/cds';
import { loadMailbox } from './srv/agent/mailbox.js';
import { agentCard, handleA2A } from './srv/a2a.js';
import { modelConfig, profile } from './srv/agent/config.js';

// Local settings (API keys, ZT_PROFILE, ...) from .env, which git ignores.
try {
  process.loadEnvFile?.('.env');
} catch {
  // no .env: simulated model, demo profile
}

cds.on('bootstrap', (app) => {
  // Local demo: no login prompt. A request from this machine without credentials is treated
  // as the mocked user alice (Approver + AgentCaller). CAP's `dummy` auth would make everyone
  // "privileged", which is a technical user and cannot sign at Gate 2, so this keeps a named
  // person instead. Off in production and in tests; ZT_LOGIN=true brings the login prompt back.
  const loopback = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if (!['production', 'test'].includes(process.env.NODE_ENV) && process.env.ZT_LOGIN !== 'true') {
    app.use((req, _res, next) => {
      if (!req.headers.authorization && loopback(req)) {
        req.headers.authorization = `Basic ${Buffer.from('alice:alice').toString('base64')}`;
      }
      next();
    });
  }

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // A2A discovery. Public on purpose: the card holds no secrets.
  for (const path of ['/.well-known/agent.json', '/.well-known/agent-card.json']) {
    app.get(path, (req, res) => res.json(agentCard(process.env.ZT_A2A_BASE_URL ?? `${req.protocol}://${req.get('host')}`)));
  }
  // A2A JSON-RPC. Joule's agent-request posts to the destination URL itself
  // (the app root); other clients use /a2a from the card. CAP's middlewares
  // run first, so the caller is authenticated the same way as for OData.
  app.post(['/', '/a2a'], ...cds.middlewares.before, handleA2A);
});

cds.on('served', async () => {
  await loadMailbox();
  const m = modelConfig();
  cds.log('agent').info(
    `model: ${m.provider}${m.provider === 'simulated' ? ' (no API key; tokens are estimates)' : ` ${m.model}`} · profile: ${profile().name}`,
  );
});

export default cds.server;

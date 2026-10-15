# Security

This is a teaching repository. Run it on your laptop or in a demo subaccount.

## Model-written code and `node:vm`

The agent asks a model for code and runs it in `node:vm` ([srv/lib/sandbox.js](srv/lib/sandbox.js)). That is not a security boundary. It removes `require`, `process` and I/O from the code's scope, enforces a time limit and passes JSON only, which catches honest mistakes. Hostile code can escape it. Do not point this agent at a model or a prompt you do not control, and do not run code from an untrusted source with it. A real system needs a container or micro-VM with no network, a read-only filesystem and resource limits.

## Keys

API keys go in `.env` locally (git ignores it) and in a git-ignored MTA extension on BTP (`deploy/cf/zt.mtaext`). Never in `mta.yaml`, never in source. Use a key with a spending limit.

## Who may do what

Locally the users are mocked (`package.json`): `alice` may run and sign, `joule` may run, `bob` may only read. On BTP the roles come from `xs-security.json`. A signature from a client-credentials user or a name that looks like an agent is rejected; that is a guard against a mistake, not an identity check.

The no-login convenience on your machine ([server.js](server.js)) treats a request without credentials as `alice` when the connection comes from `127.0.0.1` or `::1`. Behind a reverse proxy or a tunnel on the same machine (nginx, ngrok, a port forward) every request looks local, so everyone who can reach it becomes `alice`, who can sign playbooks. Do not expose a locally started server that way. Set `ZT_LOGIN=true` to turn the shortcut off; it is already off with `NODE_ENV=production` or `test`.

## Logs hold data

Runs store tool inputs and outputs. Redact before sharing a log, and keep real logs out of version control.

## Reporting

For a vulnerability, use GitHub's private vulnerability reporting (Security tab) if it is enabled. If not, open an issue saying you have a security concern, without details, and I will arrange a private channel. This is a personal project maintained in spare time; I read reports and cannot promise a response time.

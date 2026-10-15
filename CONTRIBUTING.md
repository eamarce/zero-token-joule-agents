# Contributing

Issues and pull requests are welcome. This is a small teaching repository; changes that keep it small are easier to accept.

- Node 22 or newer, ES modules. `npm test` must pass, and it must keep passing with no network and no API key.
- Data stays synthetic, in the toy domain, with `.example` domains. Do not contribute logs, emails or documents from a real system or company, even redacted.
- Every run must keep writing the same record whatever its type. The ratio, the crystallizer and the calculator depend on it.
- The route must not depend on a model call, and no code path may let an agent sign a playbook.
- If you change the mailbox, change `scripts/make-mailbox.js` and regenerate `data/mailbox.json`; CI checks that they match. Same for `scripts/make-otel-sample.js`.
- Docs say what was tested and what was not. No claims of production use.
- If you change [AGENTS.md](AGENTS.md), run through the lesson once with a coding agent and check that the numbers it quotes still come out of the commands.

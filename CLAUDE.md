# CLAUDE.md

Read [AGENTS.md](AGENTS.md) first and follow it. It covers both jobs in this repository: guiding a person through the pattern step by step, and changing the code.

Quick facts:

- `npm test` runs every test (unit, provider wiring with a fake fetch, end to end over the whole mailbox). It needs no network and no API key.
- `npm start` serves on http://localhost:4004 with an in-memory database; a restart starts over.
- `npm run ctl -- help` lists the commands you use to drive the running agent. Add `--json` for data.
- Gate 2 (signing a playbook) is the person's decision. Never sign on your own initiative.

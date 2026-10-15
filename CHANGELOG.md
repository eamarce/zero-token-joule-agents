# Changelog

## 0.2.0 (unreleased)

The repository is now a running agent instead of a command-line toolkit.

- SAP CAP 10 (Node.js) app with a LangGraph.js agent: explores supplier emails (Type 3), proposes code from repeated paths, backtests it, runs it as a playbook with the code in the shadow (Type 2), and after a person signs, with no model (Type 1), re-checked every Nth run and demoted after repeated disagreements.
- Models: Anthropic (`claude-opus-5-5`), OpenAI (`gpt-5.4-mini`), Google Gemini (`gemini-3.8-flash`), or a simulated model with estimated tokens that needs no key.
- Synthetic mailbox of 40 emails that shows the whole cycle, including a silent drift and a rejected backtest.
- Fiori launchpad with four apps: Agent and Playbooks (SAP Fiori elements worklists with object pages), Calculator and Joule A2A console (SAPUI5 freestyle). Quartz theme, compact density.
- The Agent and Playbooks apps do not refresh by themselves; each has a Refresh button in the toolbar of its table, so what changes on screen is what the person asked for.
- Opportunity calculator for run-log JSONL and OpenTelemetry GenAI traces. The thresholds of its four questions (tokens, repeats, path share) can be set from the command line (`--min-tokens`, `--min-repeats`, `--min-share`) or in the app, and every run prints the ones it used.
- A2A 0.3 endpoint and a Joule capability (`agent-request`), with Cloud Foundry deployment (MTA, XSUAA, approuter, destination script).
- AGENTS.md: a lesson plan for coding agents.
- Replaces the 0.1.0 `zta` CLI. Its measurement code lives on in `srv/lib/`.

## 0.1.0

First version for SAP TechEd Berlin 2026, CT1106: the `zta` command-line toolkit over synthetic logs.

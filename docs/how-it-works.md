# How it works

## One email, start to finish

`processMessage` in [srv/agent/engine.js](../srv/agent/engine.js):

1. Load the email. The subject key is the sender's domain: one playbook per supplier template.
2. Look up the newest playbook for that subject in status `playbook`, `eligible` or `frozen`. No model is involved in this choice.
3. Run one route:
   - no playbook: `runExplore`, the LangGraph agent (Type 3)
   - `playbook` or `eligible`: `runPlaybook` (Type 2)
   - `frozen`: `runFrozen` (Type 1, or Type 2 on a re-check run)
4. If a playbook route cannot produce a valid answer, hand the case to `runExplore` and mark the run `fallback`.
5. Write one `Runs` row with its tool calls and one `ModelCalls` row per model call.
6. Ask the crystallizer whether a proposal is due ([srv/agent/crystallizer.js](../srv/agent/crystallizer.js)).

## The explore agent (Type 3)

[srv/agent/graph.js](../srv/agent/graph.js) is a two-node LangGraph `StateGraph` over `MessagesAnnotation`: `agent` calls the model with the tools bound, `tools` is LangGraph's `ToolNode`, and a conditional edge loops until the model stops calling tools. The tools are in [srv/agent/tools.js](../srv/agent/tools.js):

| Tool | Does |
|---|---|
| `read_email` | reads one email from the mailbox |
| `lookup_supplier` | finds the supplier by email domain |
| `write_order` | validates the order (the output check) and writes it |
| `draft_reply` | saves a reply for a person to send |

Every call, from the model or from a playbook, goes through the same recorder, so all three run types leave the same trace.

## The playbook (Type 2)

Steps in a fixed order: `read_email`, then one narrow model call that returns four fields as JSON, then `lookup_supplier` and `write_order`. In parallel the candidate code runs in the sandbox on the same email and its answer is compared with the model's. Agreement extends the streak; disagreement resets it, and two disagreements retire the version before anyone signs it.

## The signed code (Type 1)

`read_email`, the code in the sandbox, the output check, then `lookup_supplier` and `write_order`. No model call. Every Nth frozen run the model also reads the email; if it disagrees, its answer is used and the disagreement is counted.

## The crystallizer

After each clean run of a task that has an answer contract (`CONTRACTS` in [srv/agent/config.js](../srv/agent/config.js)):

1. If there is no active playbook for the subject, take the last N runs where the model produced the answer, since the last version was closed.
2. If all N took the same tool path cleanly, give the model up to 8 past cases (email in, order out) and ask it for `function extract(input)`.
3. Log that model call as `propose`, outside any run.
4. Backtest the code in the sandbox against every past case the model answered for that subject. All must match.
5. Pass: gate 1, status `playbook`. Fail: status `rejected`, and the cases stay with the model.

Statuses, in order: `proposed`, then `rejected` or `playbook`, then `eligible`, `frozen` and finally `demoted`. Each transition is a row in `Decisions`, which nothing updates or deletes.

## Models

[srv/agent/models.js](../srv/agent/models.js) gives the agent three calls: `agentStep` (explore), `interpret` (the narrow Type 2 job) and `writeExtractor` (proposals). Providers:

| `ZT_MODEL_PROVIDER` | Model | Tokens |
|---|---|---|
| `simulated` (default without a key) | hand-written rules in [srv/agent/simulated.js](../srv/agent/simulated.js) | estimated, characters / 4 |
| `anthropic` | `ChatAnthropic`, default `claude-opus-5-5` | from the API's usage |
| `openai` | `ChatOpenAI`, default `gpt-5.4-mini` | from the API's usage |
| `google` | `ChatGoogleGenerativeAI` (Gemini), default `gemini-3.8-flash` | from the API's usage |

The simulated model writes a plausible bug on purpose (`parseFloat` on a total with a thousands separator), so the re-check and the demotion have something to catch.

## Data

[db/schema.cds](../db/schema.cds). The mailbox, suppliers, orders and replies are the toy business domain. `Runs`, `ToolCalls` and `ModelCalls` are the log. `Playbooks` and `Decisions` are governance. `A2ATasks` holds Joule requests. `Emails.expected_json` is the synthetic ground truth; the agent never reads it, and the OData service does not expose it.

## A2A

[srv/a2a.js](../srv/a2a.js), mounted in [server.js](../server.js) after CAP's middlewares so the caller is authenticated the same way as for OData. `message/send` reads the text: "ratio" or "status" returns the ratio, an id like `msg-1007` processes that email, anything else processes the next one. The answer is a completed A2A task whose `status.message.parts[0].text` is what Joule shows. `tasks/get` returns a stored task.

## Authorization

| Role | Who | May |
|---|---|---|
| any logged-in user | | read runs, playbooks, decisions; use the calculator |
| `AgentCaller` | people in the cockpit; Joule's client credentials | process emails, call `/a2a` |
| `Approver` | people | sign or reject playbooks |

Locally these are mocked users in `package.json`: `alice` (both roles), `joule` (AgentCaller), `bob` (none). On BTP they come from `xs-security.json`.

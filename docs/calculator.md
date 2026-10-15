# The opportunity calculator

Give it a log of what an agent did. It returns the Type 1 : 2 : 3 ratio and the paths worth freezing, ranked by the tokens they have cost. The work is arithmetic on the file: no model call, no API key.

Use it from the Calculator app in the launchpad (upload, paste, or load a sample) or from the command line:

```bash
npm run ctl -- analyze                              # this agent's own runs
npm run ctl -- analyze my-runs.jsonl --price 3      # price per million tokens, for a cost estimate
npm run ctl -- analyze traces.json --format otel
npm run ctl -- analyze my-runs.jsonl --json         # everything, for your own charts
npm run ctl -- analyze --min-tokens 10000           # see results before 100,000 tokens have been spent
```

### Change the thresholds

The four questions use defaults that suit a log with real traffic. A short log, such as one pass through this repository's mailbox, never reaches them, so every path says `keep-with-model`. Lower them to see how the calculator reasons, and raise them for your own agent once you know what a path is worth:

| Question | Command line | Calculator app field | Default |
|---|---|---|---|
| repeated | `--min-repeats N` | Minimum repeats | 10 runs |
| stable | `--min-share 0..1` | Minimum path share (0 to 1) | 0.8 |
| valuable | `--min-tokens N` | Minimum tokens spent | 100,000 tokens |

The output prints the thresholds it used. A lower threshold changes only what the calculator reports; it does not make a path safer to freeze.

## Format 1: run-log JSONL

One JSON object per line, validated against [schema/run-log.schema.json](../schema/run-log.schema.json). The minimum:

```json
{"run_id":"r-1","task":"parse_order_email","started_at":"2026-10-01T08:00:00Z",
 "tool_calls":[{"name":"read_email","input":{},"output":{}},{"name":"write_order","input":{},"output":{}}],
 "tokens":{"input":5800,"output":310},"outcome":{"status":"clean"}}
```

`task` names the kind of case; pick a stable value, because changing it splits the history. The tool path (the call names in order) identifies a route within a task. `playbook_id` marks runs a playbook executed. `outcome.status` is `clean`, `corrected` (a person changed the result) or `failed`. This agent exports exactly this format (`npm run ctl -- export`).

## Format 2: OpenTelemetry traces

OTLP JSON, as written by the OpenTelemetry file exporter or exported from most trace backends: one document, or one per line. The mapping is in [srv/lib/otel.js](../srv/lib/otel.js):

| Run-log field | From |
|---|---|
| one run | one trace (`traceId`) |
| `tool_calls` | spans with `gen_ai.operation.name` = `execute_tool`, in start order, named by `gen_ai.tool.name`; `gen_ai.tool.call.arguments` and `.result` if present |
| `tokens` | the sum of `gen_ai.usage.input_tokens` and `gen_ai.usage.output_tokens` over the trace; each span carrying them is one model call |
| `started_at` | the root span's start |

OpenTelemetry does not define three things the calculator needs. Add them as span attributes:

| Attribute | Meaning | If missing |
|---|---|---|
| `zt.task` | the kind of case | `gen_ai.agent.name`, then the root span's name |
| `zt.playbook_id` | set when a playbook ran the steps | null |
| `zt.outcome` | `clean`, `corrected` or `failed` | `failed` if the root span's status is ERROR, else `clean` |

The GenAI semantic conventions are still marked "Development" by OpenTelemetry. If attribute names change, the mapping lives in one file.

## What it reports

- the ratio and the token split by type, over the log's time window
- candidates: model-using runs grouped by task and tool path, ranked by repeats × mean tokens
- for each candidate, the four questions:
  - repeated: at least 10 runs on the path (`minRepeats`)
  - stable: the path is at least 80% of the task's last 20 runs (`minPathShare`)
  - valuable: at least 100,000 tokens spent (`minTokens`), or `audit_required`
  - operable: an owner, a test and a fallback, which only a person can supply
- a verdict: `freeze` (all four), `candidate` (the three the log can answer) or `keep-with-model`
- tokens per month, extrapolated from the window, and a cost if you give a price

## Answering "operable"

Pass answers in `options` (cockpit and API) keyed by `"<task> <path>"` or by task:

```json
{
  "pricePerMTok": 3,
  "minRepeats": 10,
  "answers": {
    "post_vendor_invoice": { "owner": "AP team", "test": "tests/invoice.json", "fallback": "back to the agent" }
  }
}
```

Over HTTP: `POST /odata/v4/calculator/analyze` with `{ "content": "<file text>", "format": "auto", "options": "<the JSON above as a string>" }`.

## Limits

- Stability is a proxy: it sees the path changing, not the inputs drifting.
- Runs with zero tokens are Type 1 and never candidates. If your platform does not report tokens per run, estimate them first, or the ranking means nothing.
- Monthly figures are the window scaled to 30 days. They are arithmetic, not a forecast.
- Redact logs before sharing them. Tool inputs and outputs carry whatever your agent read and wrote.

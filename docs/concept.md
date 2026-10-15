# Concept

## The pattern

Let the agent explore the first cases. Turn what it validated into a playbook or into code. A person signs it. From then on that kind of case runs without the model, and keeps being checked. The model stays for what is new.

## Three types of run

| Type | Who decides | Tokens per run (orders of magnitude from the talk) |
|---|---|---|
| 3 | The agent explores the whole case | 10k to 50k |
| 2 | A playbook runs fixed steps; the model interprets what it sees | 1k to 5k |
| 1 | Rules and code; no model at runtime | 0 |

The type is computed from the log, never declared: zero tokens is Type 1, a playbook with tokens is Type 2, everything else is Type 3. A Type 1 playbook's re-check runs call the model, so they count as Type 2. Fallbacks count as Type 3.

The number to track is the ratio of the three over a period, before and after you freeze something. A count of agents says nothing about it.

## Four questions before freezing

1. Repeated. The same path many times. The talk's default is 10; five is a coincidence.
2. Stable. The input will look the same next month. The log can only proxy this, by checking that the path is not changing.
3. Valuable. Enough tokens spent on the path, or a requirement to audit it.
4. Operable. An owner, a test, and a way back to the model. No log knows this; a person answers it.

Fail one and the path stays with the model. The agent in this repository applies them in a narrow form: repeated and stable through "the same path N times in a row", operable through the answer contract (only a task whose answer can be compared field by field gets a playbook; a free-text reply never does). The calculator applies all four to any log.

## Two gates

| Gate | Evidence | Result |
|---|---|---|
| 1, automatic | The candidate code reproduces the model's past answers (backtest) | Type 2: the playbook runs the steps, the model still reads the fields, the code runs in the shadow |
| 2, a person | N clean runs in a row where the shadow code agreed with the model, then a named person signs that version | Type 1: the code runs with no model |

The agent proposes. It does not approve. A signature from an agent, a bot or a client-credentials user is rejected.

## After the signature

- Every Nth run is also answered by the model and compared. A disagreement uses the model's answer.
- After two disagreements the version is demoted. Its cases go back to the model, and the next proposal is built from the cases it got wrong.
- An answer that fails the output check goes back to the model at once.

Re-checking by sampling lets wrong answers through between samples. The interval is a decision about what a wrong answer costs compared with a model call.

## What you gain and what it costs

You gain exact replay ("line 12 did it" instead of "the model said so"), unit tests instead of model grading on every run, and lower, predictable cost on the repeated part of the traffic.

It costs a person's review and signature, an owner for every playbook, tokens to write the candidate code, and frozen logic that breaks when the world changes. Design the way back before you ship the playbook.

## Where the idea comes from

The pattern and the three types follow Malik, "Progressive Crystallization" (arXiv 2607.07052), one production platform reporting its own numbers. The case for a reviewed artifact follows SkillsBench (arXiv 2602.12670). The extension here, where the artifact is code the model writes, tested in a sandbox and backtested on past runs, is mine, and it is a teaching example.

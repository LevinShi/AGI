# Research OS Core RC1

Research OS Core is a minimal, evidence-governed workflow for research where a cheap extraction pass must not silently lower decision quality.

## It solves

- **Missed coverage:** a Ledger can look complete while an expected source category was never checked.
- **Evidence drift:** a weak worker can turn plans, claims, or reposts into stronger facts than the source supports.
- **Confirmation bias and runaway work:** support evidence can stop the search too early, while unresolved tasks can loop between agents.

## The solution

`1 Director (Sol) + 1 Researcher persona + 2 phases (Research → Judge) + 1 Evidence Ledger`

Sol fixes the Charter, Expected Source Map, QIDs, and L/T/S routes in one batch. Luna/Terra Researcher instances are read-only and return only `DONE` or `UNCERTAIN`; they extract verbatim fragments from both support and counter searches without judging claim direction or reliability. Sol appends the returned text, rereads decisive evidence, randomly audits non-decisive evidence, records Unknowns, and may run one bounded repair round.

The four non-negotiable gates are **Coverage, Fidelity, Disconfirmation, and Unknown**. A report is called `Quality-Passed` only when all four pass. There is no default Verifier, Plan Critic, Lane Memo, Compliance Agent, Red Team, benchmark, or forced A/B test.

## Files

- `SKILL.md` — Director workflow and RC1 invariants.
- `researcher.toml` — the single read-only Researcher persona; model is deliberately selected per QID by Sol.
- `evidence.md` — append-only Ledger template for Charter, worker batches, Judge checks, repairs, and Unknowns.

## Installation

### User installation

1. Copy this folder to `~/.codex/skills/deep-research/`.
2. Copy `researcher.toml` to `~/.codex/agents/researcher.toml` for a personal agent, or to the project’s `.codex/agents/researcher.toml` for a project-scoped agent.
3. Keep `evidence.md` as a template; copy it into each research project before starting a run.

The custom agent file must remain read-only. Do not add a model field to it: Sol must explicitly choose `gpt-5.6-luna` or `gpt-5.6-terra` for each QID.

### Agent invocation

Run the Director on `gpt-5.6-sol` and invoke:

```text
Use $deep-research for: [decision question]
Reader/decision: [who will act and what decision follows]
Scope: [geography, period, channel, definitions, exclusions]
Output: conclusion first, with Evidence IDs, boundaries, and unresolved Unknowns
```

The agent creates the Charter inside the Ledger, routes QIDs in one batch, performs Research → Judge, and stops after one default bounded repair round. It must disclose any missing agent configuration or failed quality gate.

## Privacy boundary

This package contains no personal paths, account identifiers, credentials, or project-specific research data. Keep source URLs, excerpts, and business-sensitive material in the project’s working Ledger, not in the reusable skill files.

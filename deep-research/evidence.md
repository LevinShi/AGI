# Evidence Ledger — Research OS Core RC1

> 每个研究项目先复制本模板。它是 append-only 工作附录，不是读者正文。Researcher 只返回文本；Sol Director 批量追加。已接受内容不覆盖，纠错通过 Amendment 追加。

## Run Charter

- Run ID:
- Decision / reader:
- Director model: `gpt-5.6-sol`
- Geography / market:
- Time range:
- Channel / business boundary:
- Definitions:
- Exclusions:
- Default repair budget: `1`

### QIDs and batch routing

| QID | Verifiable subquestion | Initial route `L/T/S` | Routing reason | Completion condition | Status |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

### Expected Source Map

| Class ID | Source class definition | Applies to QID | `required/conditional` | Coverage condition | Judge status |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

Judge status uses `COVERED`, `SOURCE_GAP`, or `NOT_APPLICABLE`. A zero-result search is never evidence that the underlying fact does not exist.

### Charter Amendment Log

Append every scope, definition, routing, Source Map, or repair-budget change.

#### Amendment

- Amendment ID:
- Timestamp:
- Changed by: Sol Director
- Previous value:
- New value:
- Reason:
- Affected QIDs:

## Worker Batches

The Director supplies this exact block to the Researcher. The Researcher returns one block per assignment; the Director validates and batch-appends it. `search_pass` records query intent only and is not an evidence-direction judgment.

### Worker Batch

- Batch ID:
- QID:
- Route used: `L` or `T`
- Model used: `gpt-5.6-luna` or `gpt-5.6-terra`
- STATUS: `DONE` or `UNCERTAIN`
- Status reason:
- Support-search completed: `YES` or `NO`
- Counter-search completed: `YES` or `NO`

#### Search execution

| Pass `support/counter` | Query or retrieval path | Source classes attempted | Result note |
|---|---|---|---|
|  |  |  |  |

#### Attempts without extractable evidence

| Source class | Source or query | Failure / ambiguity | What would resolve it |
|---|---|---|---|
|  |  |  |  |

This section records the worker's observed attempt. Only Sol may convert a missing required class into `SOURCE_GAP` during Judge.

#### Evidence Record

- Evidence ID:
- QID:
- Search pass: `support` or `counter`
- Source class:
- Source type:
- Title:
- Publisher / issuing body:
- URL:
- Published at:
- Event at, if different:
- Precise locator: page / section / paragraph / table / timestamp
- Retrieved at:
- Access state:

**Exact excerpt**

> 

**Surrounding context needed to interpret the excerpt**



**Worker caveat — extraction or access only; no reliability or claim-direction judgment**



Repeat `Evidence Record` as needed. The Researcher must not add support/contradict, reliability, decisive, effectiveness, causality, prevalence, or final-conclusion fields.

## Judge Log — Sol only

### Judge Pass

- Judge ID:
- Timestamp:
- Repair round: `0` or `1`
- Evidence count:
- Non-decisive evidence count `N`:

#### Coverage snapshot

| Class ID | Applicable QIDs | Evidence IDs / count | Status `COVERED/SOURCE_GAP/NOT_APPLICABLE` | Decision impact |
|---|---|---|---|---|
|  |  |  |  |  |

#### Claim–evidence annotations

Only Sol fills this table.

| Claim ID | Claim | Evidence ID | Relation `supports/contradicts/context/unclear` | Reliability `use/limited/reject` | Decisive `YES/NO` | Reason |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

#### Decisive evidence reread

Sol must select decisive evidence independently and reopen every original source.

| Evidence ID | Source reopened | Exact excerpt matched | Context/date/locator matched | Result `PASS/FAIL` | Note |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

#### Random non-decisive fidelity audit

- Formula: `n = min(N, 10, max(2, ceil(0.05 × N)))`; if `N = 0`, `n = 0`
- Random seed:
- Sample size `n`:
- Sampled Evidence IDs:

| Evidence ID | Source reopened | Excerpt/context/locator matched | Result `PASS/FAIL` | Note |
|---|---|---|---|---|
|  |  |  |  |  |

#### Disconfirmation check

| QID | Support pass completed | Counter pass completed | Counter-pass evidence IDs or documented no-result | Status `PASS/FAIL` |
|---|---|---|---|---|
|  |  |  |  |  |

#### Unknown Register

| Unknown ID | QID / Claim ID | Unresolved item | Cause | Decision impact | Evidence needed to change it |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

#### Four quality gates

Unknown passes when every material unresolved item is disclosed and the conclusion is narrowed accordingly.

| Gate | Result `PASS/FAIL` | Decisive reason | Affected QIDs | Repair needed |
|---|---|---|---|---|
| Coverage |  |  |  |  |
| Fidelity |  |  |  |  |
| Disconfirmation |  |  |  |  |
| Unknown |  |  |  |  |

## Bounded Repair Log

Default maximum: one targeted repair round. Reopen only failed QIDs; keep the same L/T/S rules and at most one `Luna → Terra` subagent upgrade. If repair changes the Charter, append an Amendment before research resumes.

### Repair Request

- Repair round: `1`
- Triggering Judge ID:
- Failed gates:
- Affected QIDs:
- Targeted evidence need:
- Route and upgrade allowance:
- Resulting Worker Batch IDs:
- Final disposition: `RESOLVED` or `UNKNOWN`

## Optional Cross-model Red-team Log

Leave empty unless the work concerns a major investment, strong controversy, high-risk causal claim, or the user explicitly requests it. This is an optional Judge check, not a standing role or phase; the red-team cannot write or adjudicate the Ledger.

- Trigger:
- Authorization / request:
- Model distinct from Director:
- Critique received:
- Sol adjudication with Evidence IDs:

## Amendments to Accepted Evidence

Never delete or overwrite an accepted Evidence Record.

### Evidence Amendment

- Amendment ID:
- Supersedes Evidence ID:
- Reason:
- Corrected field or record:
- Added by: Sol Director
- Timestamp:

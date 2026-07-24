# Context-aware translation & quality scoring

Voxiis — AI Engineer (Agents & Internal Products), Round 2.

A working pipeline that translates product UI strings English → Spanish using the context they
actually ship in, and scores existing translations against a fixed, published policy.

- **Live report:** _(deployed link)_
- **Run it yourself:** `npm install && npm run pipeline:mock` — no API key needed
- **Full run output:** [`reports/baseline.md`](reports/baseline.md) · [`reports/baseline.json`](reports/baseline.json)

---

## The thing worth noticing first

Both batches were given to me separately, but they overlap. Line up the failures in Part 2 against
the strings in Part 1 and the previous process's mistake stops looking like bad Spanish:

| Key | English | Existing Spanish | What's wrong |
|---|---|---|---|
| `ticket.button.open` | Open | **Abierto** | "Abierto" is the correct translation — of `settings.hours.status_label_open`, a different string |
| `feed.button.post` | Post | **Correo** | "Correo" is the correct translation — of `mail.label.post`, a different string |

Right word, wrong slot. Twice. The old process wasn't producing bad Spanish, it was producing Spanish
for a string it couldn't see the context of — and then two strings that shared an English word got
each other's answer. `invoice.field.amount_due` → "Vencido" is the same failure in a quieter register:
"Vencido" means *overdue*, so an invoice screen now asserts the customer is late when the English only
said an amount was owed.

That is the failure this pipeline is built to make impossible, and it's why context is an input to
every stage rather than a nice-to-have.

---

## Approach

### 1. Claude finds issues. Code computes the score.

The model is explicitly instructed never to emit a number, a grade, or a severity. Its only job is to
detect defects and classify each into a closed set of categories. Severity is then looked up from a
table in [`src/pipeline/config.ts`](src/pipeline/config.ts), and the score is arithmetic:

```
score = 100 − Σ penalty(severity)      critical −40 · major −25 · minor −10 · nit −3
```

This is what makes the numbers mean something:

- the same defect costs the same on every string, in every run, forever
- changing the quality bar is a one-line diff in a table, not a prompt rewrite and a re-baseline
- every score in the report is shown with its arithmetic, so a reviewer can check it by hand
- a model that drifts changes *which issues are found* — it cannot quietly change *what they cost*

If instead you ask a model "score this 0–100", you get a number nobody can audit, that moves when the
prompt is edited, and that means something subtly different for each string it's applied to.

### 2. Code checks what code can check

Some of localization QA has exactly one right answer. Those run as plain functions in
[`src/pipeline/checks.ts`](src/pipeline/checks.ts) and never reach the prompt:

| Deterministic (code) | Judgment (Claude) |
|---|---|
| placeholder integrity `{count}` `%s` `{{name}}` | wrong sense of an ambiguous word |
| HTML/markup tag integrity | grammatical form vs. UI element |
| glossary compliance & do-not-translate terms | meaning shift |
| left-in-English detection | register / formality |
| leading & trailing whitespace, punctuation | fluency |
| length budget (UI overflow risk) | |
| cross-batch terminology consistency | |

Spending a model call on "did `{count}` survive?" costs money and latency and introduces the chance of
a confident wrong answer to a question that `String.match` answers perfectly. The model's attention
goes where judgment is actually required.

### 3. The key is a first-class input, not decoration

`ticket.button.open` isn't just an identifier — it says *this string is on a button*, and that
determines the grammar Spanish needs. A button takes an infinitive (`Reabrir`); a status label takes
an adjective (`Abierto`). Same English word, non-negotiably different Spanish.

[`src/pipeline/uiRole.ts`](src/pipeline/uiRole.ts) derives that role from the key by pattern matching
— deterministically, same answer every time — and passes it to Claude as a **constraint**, not
something to infer. This is what turns "is this translation good?" (a matter of opinion) into "is this
the form a button requires?" (checkable).

It's also why `ui_role_mismatch` exists as its own category: a translation can be lexically correct
and still break the interface.

### 4. Ambiguity is detected in code, then resolved by the model

Before any translation happens, the batch is grouped by source text. If the same English string
appears under more than one key, the batch has *proved* the word is context-dependent — no model
needed. Claude is then told explicitly: *"'Open' also appears at `settings.hours.status_label_open`,
which is a status label; these must not receive the same translation."*

This has a second, less obvious payoff. The consistency check ("same English, same slot, different
Spanish → flag it") would otherwise fire a **false positive** on `ticket.field.due` → "Vencimiento"
vs `invoice.field.amount_due` → "Importe adeudado". Those *should* differ. So ambiguity detection
**suppresses** the consistency check: consistency is only a meaningful requirement for terms that
aren't context-dependent. Getting this wrong would have meant a QA tool that punishes the correct
answer.

### 5. Part 2 is run against Part 1

The scorer is pointed at the pipeline's own translations using the identical policy, and the result
ships in the report. A quality gate you're unwilling to point at your own work isn't a quality gate,
and it demonstrates the two halves are one pipeline rather than two scripts that share a folder.

### 6. Context is recovered, not required

Part 2's input had no developer comments. Rather than scoring blind, each row is joined by key against
the string catalogue to recover the comment, and every result records whether that join succeeded
(`contextRecovered`). All 8 matched here. Unmatched rows are still scored, and the report says so
rather than quietly scoring them at a disadvantage.

---

## Results

8 existing translations scored, 5 clean, 3 flagged, mean 80.6.

| Key | English | Spanish | Score | Finding |
|---|---|---|---|---|
| `ticket.button.open` | Open | Abierto | **35** | wrong sense + wrong form for a button |
| `feed.button.post` | Post | Correo | **35** | wrong sense + wrong form for a button |
| `invoice.field.amount_due` | Due | Vencido | **75** | says *overdue* where the English says *owed* |
| `ticket.button.close` | Close | Cerrar | 100 | — |
| `ticket.field.due` | Due | Vencimiento | 100 | — |
| `ticket.button.assign` | Assign | Asignar | 100 | — |
| `ticket.button.share` | Share | Compartir | 100 | — |
| `report.button.export` | Export | Exportar | 100 | — |

Anything under 90, or carrying any critical issue, is routed to a human regardless of the number.

---

## Running it

```bash
npm install

npm run pipeline:mock     # full pipeline against committed fixtures — no key, no network
npm run pipeline          # live; needs ANTHROPIC_API_KEY
npm run dev               # the reviewer-facing report at localhost:3000
```

Configuration is environment only — the code never takes a key as an argument and never writes one to
a file:

| Variable | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Read automatically by the SDK. Absent ⇒ the pipeline falls back to fixtures rather than failing. |
| `PIPELINE_MODEL` | `claude-opus-4-8` | |
| `PIPELINE_EFFORT` | `high` | Validated against the allowed set at startup, so a typo isn't a 400 twenty seconds later. |
| `PIPELINE_MODE` | auto | `mock` forces fixtures. |

`npm run pipeline` writes `reports/baseline.json` (which the web report renders) and
`reports/baseline.md`. **Both modes are labelled in the output and in the UI** — a fixture run says so
in a banner, so no one mistakes committed fixtures for model output.

### Structure

```
data/          source strings, existing translations, glossary
src/pipeline/  config.ts    the entire scoring policy (penalties, bands, categories)
               checks.ts    deterministic checks — no model involved
               uiRole.ts    key → UI element → required grammatical form
               claude.ts    API layer: structured outputs, typed error handling
               translate.ts Part 1
               score.ts     Part 2
               run.ts       orchestration + self-check
src/app/       the reviewer-facing report and the live endpoint
reports/       committed output of a real run
```

---

## API notes

- **Structured outputs** (`output_config.format` with a JSON schema) rather than "please reply with
  JSON". Malformed shapes can't come back, so there's no defensive parsing layer.
- **Adaptive thinking** with `effort: high`. Translating "Open" on a button warrants more reasoning
  than "Export"; adaptive lets the model spend accordingly instead of a fixed budget.
- **No `temperature`.** Opus 4.8 removed the sampling parameters — passing `temperature: 0` returns a
  400, it doesn't quietly do nothing. Reproducibility here comes from the fixed prompt, the fixed
  schema, and scoring being arithmetic in code rather than from a sampling knob.
- **`stop_reason` is checked before the content is read.** A `max_tokens` truncation produces
  well-formed-looking output that is silently incomplete; a refusal produces no content at all. Both
  are handled explicitly rather than surfacing as a confusing parse error.
- **The text block is located, not assumed.** With thinking enabled the response contains thinking
  blocks too, so indexing `[0]` into the content array is a crash waiting for the first response
  that's shaped slightly differently.
- **Typed exceptions**, most specific first — auth, not-found, permission, rate limit, connection,
  then generic — so a bad key and a network blip produce different, actionable messages.
- **`_request_id` is captured on every call** and recorded in the run metadata. It's the one thing
  Anthropic support needs to trace a bad response, and it's useless if you only think to capture it
  after something's gone wrong.
- **One call per string**, run concurrently. Batching all 18 into one call would be cheaper, but a
  single malformed response would lose the whole batch, and each string gets full attention on its own
  disambiguation. Wall-clock is roughly one call either way.
- **No prompt caching.** The shared prefix here is well under Opus 4.8's ~4096-token minimum, so
  `cache_control` would silently do nothing. It's worth adding when the glossary grows past that.

---

## Assumptions

1. **Neutral international Spanish.** No locale was specified. A real deployment would need to know
   whether this is es-ES or es-419 — `Compartir` is safe everywhere, but formality conventions and
   some vocabulary are not.
2. **`ticket.button.open` means reopen.** The comment says "open a closed support ticket back up", so
   the output is `Reabrir` rather than `Abrir`. If the same button also opens never-closed tickets,
   `Abrir` is the safer choice. Flagged rather than silently decided.
3. **`mail.label.post` labels the field, not a section.** Translated as `Correo postal`; if it's a
   heading above several address fields, `Dirección postal` fits better.
4. **The glossary is illustrative.** I wrote it to exercise the code path — in production it's owned
   by the localization lead, not the engineer. Note that **it doesn't fire on this dataset**: none of
   the 18 source strings contain a glossary term. The check is implemented and unit-exercisable, but
   these results don't demonstrate it working.
5. **Length budgets are heuristic.** Real overflow depends on rendered pixel width in a specific font,
   not character count. The rule here gives short strings flat headroom rather than a proportional
   budget, because a correct 7-character translation of a 4-character word is a 1.75× "expansion" and
   not a problem.
6. **Penalty values are a starting policy, not a calibrated one.** The *shape* is defended above — a
   fixed, auditable, code-owned table. The specific numbers should be tuned against human reviewer
   agreement on a real corpus, which is exactly the kind of thing the table makes easy to change.
7. **Scoring is monolingual-target only.** It judges Spanish against English. It doesn't check
   Spanish against previously shipped Spanish in a translation memory, which is where a real system
   would get much of its consistency signal.

## What I'd add next

- **Rate limiting behind a shared store.** The live endpoint has hard input caps and a coarse
  in-memory limiter, but on serverless that resets per instance — it slows abuse, it doesn't stop it.
  This is the first thing I'd fix before the link was public for real.
- **A golden set and a regression gate.** ~50 strings with agreed answers, run on every prompt or
  model change, failing CI on a drop. Without it, "we changed the prompt and quality improved" is an
  assertion.
- **Human agreement calibration.** Have two reviewers score the same 100 strings, then tune the
  penalty table until the pipeline's rankings correlate. That converts the policy from *reasonable*
  to *evidence-based*.
- **Translation memory** as a deterministic pre-pass: exact and fuzzy matches never reach the model,
  which cuts cost and enforces consistency for free.
- **Per-string cost and latency in the report.** The plumbing records tokens and request IDs already;
  it isn't surfaced per row yet.

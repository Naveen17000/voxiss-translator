# Translation & quality report — English → Spanish

> **Fixture run.** No model was called. The deterministic checks and the scoring
> arithmetic below are real; the judgment layer is stubbed from committed fixtures.

Run 2026-07-24T15:04:18.875Z · mock · model (fixtures — no model called) · effort high
Scoring policy v1.0.0 · prompts v1.0.0 · 0 API calls

## Summary

| | |
|---|---|
| Strings translated | 10 |
| Existing translations scored | 8 |
| Passed clean | 5 |
| Flagged | 3 |
| Routed to a human | 3 |
| Mean score | 80.6 / 100 |

## Part 1 — Translations

| Key | Element | English | Spanish | Confidence |
|---|---|---|---|---|
| `ticket.button.open` | Button / action | Open | **Reabrir** | high |
| `settings.hours.status_label_open` | Status | Open | **Abierto** | high |
| `ticket.button.close` | Button / action | Close | **Cerrar** | high |
| `feed.button.post` | Button / action | Post | **Publicar** | high |
| `mail.label.post` | Field label | Post | **Correo postal** | high |
| `ticket.button.assign` | Button / action | Assign | **Asignar** | high |
| `ticket.field.due` | Field label | Due | **Vencimiento** | high |
| `invoice.field.amount_due` | Field label | Due | **Importe adeudado** | high |
| `ticket.button.share` | Button / action | Share | **Compartir** | high |
| `report.button.export` | Button / action | Export | **Exportar** | high |

### Ambiguous strings

Same English word, different answers. These are the ones a translator without product context gets wrong.

**"Open"** — 2 different meanings in this batch

- `ticket.button.open` (Button / action) → **Reabrir**
  - This is a button an agent presses, so Spanish needs a verb, not a description. The comment says the ticket is being opened back up after being closed, so "Reabrir" (reopen) is more precise than plain "Abrir".
  - Rejected "Abrir": Correct verb, but the comment says the ticket was closed and is being opened back up, which Spanish marks with the re- prefix.
  - Rejected "Abierto": An adjective describing a state. This is a button, so it needs a command.
- `settings.hours.status_label_open` (Status) → **Abierto**
  - Same English word as the ticket button, opposite grammar. This one reports that the support desk is currently open for business, so Spanish uses the adjective "Abierto".
  - Rejected "Abrir": That is a command. Nothing is being clicked here — the label describes the desk's current state.

**"Post"** — 2 different meanings in this batch

- `feed.button.post` (Button / action) → **Publicar**
  - "Post" here is the verb used in social feeds, not anything to do with mail. As a button it takes the infinitive "Publicar".
  - Rejected "Correo": That is the postal sense of "post". This button publishes to a feed.
  - Rejected "Enviar": Means send. Publishing to a shared feed is more specific.
- `mail.label.post` (Field label) → **Correo postal**
  - Same English word as the feed button, completely different meaning. This is a field label for a physical correspondence address, so it needs a noun phrase, and "postal" is what stops Spanish readers assuming email.
  - Rejected "Publicar": The feed sense of "post". This field is about physical mail.
  - Rejected "Correo": Ambiguous in Spanish — it reads as email first. "Postal" removes the doubt.

**"Due"** — 2 different meanings in this batch

- `ticket.field.due` (Field label) → **Vencimiento**
  - The deadline for resolving a ticket. A field label, so a noun.
  - Rejected "Fecha de vencimiento": Accurate but long for a field label; "Vencimiento" already reads as the due date in Spanish UIs.
  - Rejected "Vencido": Means overdue. The field shows the deadline, not whether it has passed.
- `invoice.field.amount_due` (Field label) → **Importe adeudado**
  - Same English word as the ticket deadline field, but the key and comment both say this is an amount of money. "Importe adeudado" is the balance owed and says nothing about whether it is late.
  - Rejected "Vencimiento": That is the due date sense. This field is money owed, not a date.
  - Rejected "Vencido": Means overdue — it asserts the payment is late, which the English does not.

## Part 2 — Quality scores for the existing translations

| Key | English | Spanish | Score | Verdict |
|---|---|---|---|---|
| `ticket.button.open` | Open | Abierto | **35** | Retranslate |
| `feed.button.post` | Post | Correo | **35** | Retranslate |
| `invoice.field.amount_due` | Due | Vencido | **75** | Spot-check before shipping |
| `ticket.button.close` | Close | Cerrar | **100** | Ship as is |
| `ticket.field.due` | Due | Vencimiento | **100** | Ship as is |
| `ticket.button.assign` | Assign | Asignar | **100** | Ship as is |
| `ticket.button.share` | Share | Compartir | **100** | Ship as is |
| `report.button.export` | Export | Exportar | **100** | Ship as is |

### Issues found

#### `ticket.button.open` — "Open" → "Abierto" — 35/100

- **ui role mismatch** (−25, Claude) — This is a button an agent clicks, but "Abierto" is a description of a state rather than an instruction — like labelling a button "Opened" instead of "Open".
  - Evidence: `Abierto`
  - Suggested: **Reabrir**
- **wrong sense** (−40, Claude) — The English "Open" here is the action of reopening a closed ticket, and this translation picked the meaning "is currently open" instead.
  - Evidence: `Abierto`
  - Suggested: **Reabrir**

Score: 100 −25 ui role mismatch −40 wrong sense = 35

#### `feed.button.post` — "Post" → "Correo" — 35/100

- **wrong sense** (−40, Claude) — "Correo" means mail. This button publishes a message to the team feed, so the translation has taken the wrong meaning of "Post" entirely — a Spanish speaker would not know what this button does.
  - Evidence: `Correo`
  - Suggested: **Publicar**
- **ui role mismatch** (−25, Claude) — It is also a noun where a button needs a verb.
  - Evidence: `Correo`
  - Suggested: **Publicar**

Score: 100 −40 wrong sense −25 ui role mismatch = 35

#### `invoice.field.amount_due` — "Due" → "Vencido" — 75/100

- **meaning shift** (−25, Claude) — "Vencido" means overdue. It tells the customer their payment is late, which the English "Due" does not say — the field just shows the balance owed.
  - Evidence: `Vencido`
  - Suggested: **Importe adeudado**

Score: 100 −25 meaning shift = 75

### Passed clean (5)

`ticket.button.close` → Cerrar · `ticket.field.due` → Vencimiento · `ticket.button.assign` → Asignar · `ticket.button.share` → Compartir · `report.button.export` → Exportar

## Self-check — Part 2 scoring applied to Part 1 output

The same scheme, pointed at our own translations.

All 10 of our own translations passed the same gate at 100/100.

## How the score works

Every string starts at 100. Each issue found subtracts a fixed amount by severity:

| Severity | Penalty |
|---|---|
| critical | −40 |
| major | −25 |
| minor | −10 |
| nit | −3 |

Claude never produces a number. It finds issues and puts each into a fixed category;
the severity is looked up from a table in code and the arithmetic happens there. The same
defect therefore costs the same on every string and every run, and any score in this report
can be recomputed by hand from the issues listed above it.

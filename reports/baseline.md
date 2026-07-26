# Translation & quality report — English → Spanish

Run 2026-07-26T03:45:43.253Z · live · model claude-opus-4-8 · effort high
Scoring policy v1.0.0 · prompts v1.0.0 · 28 API calls

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
| `mail.label.post` | Field label | Post | **Dirección postal** | high |
| `ticket.button.assign` | Button / action | Assign | **Asignar** | high |
| `ticket.field.due` | Field label | Due | **Vencimiento** | high |
| `invoice.field.amount_due` | Field label | Due | **Importe adeudado** | high |
| `ticket.button.share` | Button / action | Share | **Compartir** | high |
| `report.button.export` | Button / action | Export | **Exportar** | high |

### Ambiguous strings

Same English word, different answers. These are the ones a translator without product context gets wrong.

**"Open"** — 2 different meanings in this batch

- `ticket.button.open` (Button / action) → **Reabrir**
  - This is a button an agent clicks to reopen a previously closed ticket, so it uses the action verb form 'Reabrir'. It differs from the other 'Open' in the batch, which is a status label describing that the support desk is currently open for business (an adjective/state, not a clickable action).
  - Rejected "Abrir": The button reopens a ticket that was already closed, so 'Reabrir' (reopen) reflects the actual action more precisely and naturally than a plain 'Abrir'.
- `settings.hours.status_label_open` (Status) → **Abierto**
  - Aquí 'Open' describe el estado actual del servicio de soporte (está atendiendo), así que se usa el adjetivo 'Abierto'. Es distinto del botón 'ticket.button.open', que es una acción que ejecuta el agente para reabrir un ticket y debe ir en infinitivo ('Abrir').
  - Rejected "Abrir": Es un infinitivo, propio de un botón que ordena una acción; aquí se describe un estado, no se da una orden.
  - Rejected "Disponible": Se aleja del sentido literal de 'abierto' y podría confundirse con la disponibilidad de un agente en lugar del horario de atención.
  - Rejected "Abierta": La forma femenina no encaja; el sujeto implícito es el servicio de soporte y se usa la forma neutra/masculina habitual en estados de la interfaz.

**"Post"** — 2 different meanings in this batch

- `feed.button.post` (Button / action) → **Publicar**
  - Here 'Post' is the action of publishing a new message to the internal team feed, so it becomes the verb 'Publicar' on a button. This differs from mail.label.post, which is a noun about a physical mailing/correspondence address and would use a word like 'Correo' — never 'Publicar'.
  - Rejected "Publicación": That is a noun ('a post'), which would be the wrong grammatical form for a clickable button; Spanish buttons use the infinitive.
  - Rejected "Enviar": Means 'send/submit' — too generic and closer to the mail sense; 'publish to a feed' is more precisely 'Publicar'.
  - Rejected "Correo": That is the physical-mail sense used for mail.label.post; it does not apply to publishing to a team feed.
- `mail.label.post` (Field label) → **Dirección postal**
  - Here 'Post' is the British word for physical mail, and the developer note says this labels the field for a physical correspondence address, so it names an address, not an action. I chose 'Dirección postal' (mailing address). This is completely different from feed.button.post, which is a button to publish a post and would be translated as an action like 'Publicar'.
  - Rejected "Correo postal": Describes the postal service/mail itself rather than the address the field is meant to capture; less clear as an address-field label.
  - Rejected "Correo": Too ambiguous in Spanish software—readers would assume email; loses the 'physical mail' sense entirely.
  - Rejected "Publicar": That is the 'publish to feed' meaning (feed.button.post), an action verb, not this address field.

**"Due"** — 2 different meanings in this batch

- `ticket.field.due` (Field label) → **Vencimiento**
  - Aquí 'Due' se refiere a la fecha límite para resolver un ticket, por eso uso 'Vencimiento' (un plazo). En la factura, 'Due' (amount_due) significa dinero pendiente de pago, así que allí se traduce como 'Importe adeudado'; son sentidos distintos y no deben coincidir.
  - Rejected "Fecha de vencimiento": Más largo; en una etiqueta de campo o columna suele bastar 'Vencimiento', que ya se entiende como fecha límite. Sería válido si se prefiere mayor claridad.
  - Rejected "Fecha límite": Correcto en significado, pero 'Vencimiento' es la convención más habitual en software para plazos y encaja mejor como nombre de campo.
  - Rejected "Importe adeudado": Ese es el sentido de 'Due' en la factura (dinero pendiente), no el de este campo, que se refiere a una fecha límite.
- `invoice.field.amount_due` (Field label) → **Importe adeudado**
  - Here 'Due' refers to the sum of money owed on an invoice, so it's a noun phrase meaning the amount owed: 'Importe adeudado'. This is different from the ticket field, where 'Due' means a deadline/date and would be translated as 'Vencimiento'.
  - Rejected "Importe pendiente": Natural and common, but slightly less precise about the money being owed; 'adeudado' matches 'owed' more directly.
  - Rejected "Importe a pagar": Valid, but frames it from the payer's action rather than stating what is owed on the invoice.
  - Rejected "Vencimiento": This means a due date/deadline, which is the correct sense for the ticket field, not for a money amount.
  - Rejected "Adeudado": Works as an adjective but reads incomplete as a field label; adding 'Importe' makes it clearly a monetary amount.

## Part 2 — Quality scores for the existing translations

| Key | English | Spanish | Score | Verdict |
|---|---|---|---|---|
| `invoice.field.amount_due` | Due | Vencido | **35** | Retranslate |
| `feed.button.post` | Post | Correo | **35** | Retranslate |
| `ticket.button.open` | Open | Abierto | **75** | Spot-check before shipping |
| `ticket.button.close` | Close | Cerrar | **100** | Ship as is |
| `ticket.field.due` | Due | Vencimiento | **100** | Ship as is |
| `ticket.button.assign` | Assign | Asignar | **100** | Ship as is |
| `ticket.button.share` | Share | Compartir | **100** | Ship as is |
| `report.button.export` | Export | Exportar | **100** | Ship as is |

### Issues found

#### `invoice.field.amount_due` — "Due" → "Vencido" — 35/100

- **wrong sense** (−40, Claude) — The field shows the amount of money owed, but the translation means 'overdue/expired', which is a different concept.
  - Evidence: `Vencido`
  - Suggested: **Importe adeudado**
- **ui role mismatch** (−25, Claude) — This is a field label and needs a noun phrase, but the translation is an adjective.
  - Evidence: `Vencido`
  - Suggested: **Importe adeudado**

Score: 100 −40 wrong sense −25 ui role mismatch = 35

#### `feed.button.post` — "Post" → "Correo" — 35/100

- **wrong sense** (−40, Claude) — The English 'Post' here means to publish an item to the feed, but the translation means 'mail/email', which is the wrong meaning entirely.
  - Evidence: `Correo`
  - Suggested: **Publicar**
- **ui role mismatch** (−25, Claude) — This is a button that should use a verb in the infinitive, but a noun was used instead.
  - Evidence: `Correo`
  - Suggested: **Publicar**

Score: 100 −40 wrong sense −25 ui role mismatch = 35

#### `ticket.button.open` — "Open" → "Abierto" — 75/100

- **ui role mismatch** (−25, Claude) — This is a button that performs an action, so it needs a verb, but 'Abierto' is an adjective/state word meaning 'opened'.
  - Evidence: `Abierto`
  - Suggested: **Abrir**

Score: 100 −25 ui role mismatch = 75

### Passed clean (5)

`ticket.button.close` → Cerrar · `ticket.field.due` → Vencimiento · `ticket.button.assign` → Asignar · `ticket.button.share` → Compartir · `report.button.export` → Exportar

## Self-check — Part 2 scoring applied to Part 1 output

The same scheme, pointed at our own translations.

1 of 10 of our own translations were flagged by our own scoring:

- `mail.label.post` → "Dirección postal" — 90/100 — length_overflow

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

/**
 * FIXTURES — not model output.
 *
 * `PIPELINE_MODE=mock` runs the entire pipeline against these hand-written
 * fixtures with no network calls, so the app, the CLI and the report are all
 * testable without a key. Every run records its mode, and the report shows a
 * banner when it is looking at fixtures, so a reviewer is never left guessing
 * whether a number came from Claude or from this file.
 *
 * The deterministic checks and the scoring arithmetic are real in both modes —
 * only the judgment layer is stubbed.
 */

interface MockTranslation {
  translation: string
  alternatives_considered: { text: string; rejected_because: string }[]
  disambiguation_note: string
  confidence: 'high' | 'medium' | 'low'
  assumptions: string[]
}

const TRANSLATIONS: Record<string, MockTranslation> = {
  'ticket.button.open': {
    translation: 'Reabrir',
    alternatives_considered: [
      { text: 'Abrir', rejected_because: 'Correct verb, but the comment says the ticket was closed and is being opened back up, which Spanish marks with the re- prefix.' },
      { text: 'Abierto', rejected_because: 'An adjective describing a state. This is a button, so it needs a command.' },
    ],
    disambiguation_note:
      'This is a button an agent presses, so Spanish needs a verb, not a description. The comment says the ticket is being opened back up after being closed, so "Reabrir" (reopen) is more precise than plain "Abrir".',
    confidence: 'high',
    assumptions: [],
  },
  'settings.hours.status_label_open': {
    translation: 'Abierto',
    alternatives_considered: [
      { text: 'Abrir', rejected_because: 'That is a command. Nothing is being clicked here — the label describes the desk\'s current state.' },
    ],
    disambiguation_note:
      'Same English word as the ticket button, opposite grammar. This one reports that the support desk is currently open for business, so Spanish uses the adjective "Abierto".',
    confidence: 'high',
    assumptions: [],
  },
  'ticket.button.close': {
    translation: 'Cerrar',
    alternatives_considered: [
      { text: 'Cerrado', rejected_because: 'A state, not an action. Wrong form for a button.' },
      { text: 'Resolver', rejected_because: 'Reads well, but the source says Close and the paired reopen button is "Reabrir"; keeping the open/close pairing is clearer.' },
    ],
    disambiguation_note: 'A button, so the infinitive "Cerrar". It pairs with "Reabrir" on the same ticket.',
    confidence: 'high',
    assumptions: [],
  },
  'feed.button.post': {
    translation: 'Publicar',
    alternatives_considered: [
      { text: 'Correo', rejected_because: 'That is the postal sense of "post". This button publishes to a feed.' },
      { text: 'Enviar', rejected_because: 'Means send. Publishing to a shared feed is more specific.' },
    ],
    disambiguation_note:
      '"Post" here is the verb used in social feeds, not anything to do with mail. As a button it takes the infinitive "Publicar".',
    confidence: 'high',
    assumptions: [],
  },
  'mail.label.post': {
    translation: 'Correo postal',
    alternatives_considered: [
      { text: 'Publicar', rejected_because: 'The feed sense of "post". This field is about physical mail.' },
      { text: 'Correo', rejected_because: 'Ambiguous in Spanish — it reads as email first. "Postal" removes the doubt.' },
    ],
    disambiguation_note:
      'Same English word as the feed button, completely different meaning. This is a field label for a physical correspondence address, so it needs a noun phrase, and "postal" is what stops Spanish readers assuming email.',
    confidence: 'high',
    assumptions: ['Read as the label for the address field itself rather than a section heading above several fields.'],
  },
  'ticket.button.assign': {
    translation: 'Asignar',
    alternatives_considered: [],
    disambiguation_note: 'Unambiguous. A button, so the infinitive.',
    confidence: 'high',
    assumptions: [],
  },
  'ticket.field.due': {
    translation: 'Vencimiento',
    alternatives_considered: [
      { text: 'Fecha de vencimiento', rejected_because: 'Accurate but long for a field label; "Vencimiento" already reads as the due date in Spanish UIs.' },
      { text: 'Vencido', rejected_because: 'Means overdue. The field shows the deadline, not whether it has passed.' },
    ],
    disambiguation_note: 'The deadline for resolving a ticket. A field label, so a noun.',
    confidence: 'high',
    assumptions: [],
  },
  'invoice.field.amount_due': {
    translation: 'Importe adeudado',
    alternatives_considered: [
      { text: 'Vencimiento', rejected_because: 'That is the due date sense. This field is money owed, not a date.' },
      { text: 'Vencido', rejected_because: 'Means overdue — it asserts the payment is late, which the English does not.' },
    ],
    disambiguation_note:
      'Same English word as the ticket deadline field, but the key and comment both say this is an amount of money. "Importe adeudado" is the balance owed and says nothing about whether it is late.',
    confidence: 'high',
    assumptions: [],
  },
  'ticket.button.share': {
    translation: 'Compartir',
    alternatives_considered: [],
    disambiguation_note: 'Unambiguous. A button, so the infinitive.',
    confidence: 'high',
    assumptions: [],
  },
  'report.button.export': {
    translation: 'Exportar',
    alternatives_considered: [],
    disambiguation_note: 'Unambiguous. A button, so the infinitive.',
    confidence: 'high',
    assumptions: [],
  },
}

interface MockReview {
  issues: { type: string; explanation: string; evidence: string; suggestion: string }[]
  reasoning: string
}

const REVIEWS: Record<string, Record<string, MockReview>> = {
  part2: {
    'ticket.button.open': {
      issues: [
        {
          type: 'ui_role_mismatch',
          explanation:
            'This is a button an agent clicks, but "Abierto" is a description of a state rather than an instruction — like labelling a button "Opened" instead of "Open".',
          evidence: 'Abierto',
          suggestion: 'Reabrir',
        },
        {
          type: 'wrong_sense',
          explanation:
            'The English "Open" here is the action of reopening a closed ticket, and this translation picked the meaning "is currently open" instead.',
          evidence: 'Abierto',
          suggestion: 'Reabrir',
        },
      ],
      reasoning:
        'The key marks this as a button and the comment says it reopens a closed ticket. "Abierto" is the right Spanish word for a different use of "Open" — the status label elsewhere in this product — and has been applied to the wrong key.',
    },
    'ticket.button.close': {
      issues: [],
      reasoning: 'Correct. A button, translated with the infinitive, and the meaning matches the comment.',
    },
    'invoice.field.amount_due': {
      issues: [
        {
          type: 'meaning_shift',
          explanation:
            '"Vencido" means overdue. It tells the customer their payment is late, which the English "Due" does not say — the field just shows the balance owed.',
          evidence: 'Vencido',
          suggestion: 'Importe adeudado',
        },
      ],
      reasoning:
        'The key and the amount_due naming make this a sum of money, not a date. "Vencido" is understandable but adds an assertion about lateness that is not in the source, which on an invoice is a claim you do not want to make wrongly.',
    },
    'ticket.field.due': {
      issues: [],
      reasoning: 'Correct. "Vencimiento" is the standard Spanish field label for a due date.',
    },
    'ticket.button.assign': {
      issues: [],
      reasoning: 'Correct. Unambiguous verb on a button.',
    },
    'ticket.button.share': {
      issues: [],
      reasoning: 'Correct. Unambiguous verb on a button.',
    },
    'feed.button.post': {
      issues: [
        {
          type: 'wrong_sense',
          explanation:
            '"Correo" means mail. This button publishes a message to the team feed, so the translation has taken the wrong meaning of "Post" entirely — a Spanish speaker would not know what this button does.',
          evidence: 'Correo',
          suggestion: 'Publicar',
        },
        {
          type: 'ui_role_mismatch',
          explanation: 'It is also a noun where a button needs a verb.',
          evidence: 'Correo',
          suggestion: 'Publicar',
        },
      ],
      reasoning:
        'The comment is explicit that this publishes to an internal feed. "Correo" is the postal reading of "Post" — the correct translation for the mail address field elsewhere in this product, applied to the wrong key.',
    },
    'report.button.export': {
      issues: [],
      reasoning: 'Correct. Unambiguous verb on a button.',
    },
  },
  selfcheck: {},
}

export function mockTranslate(key: string): MockTranslation {
  const hit = TRANSLATIONS[key]
  if (!hit) {
    return {
      translation: '(no fixture)',
      alternatives_considered: [],
      disambiguation_note: `No mock fixture exists for ${key}. Run with a real API key.`,
      confidence: 'low',
      assumptions: ['Mock mode with no fixture for this key.'],
    }
  }
  return hit
}

export function mockScore(namespace: string, key: string): MockReview {
  return (
    REVIEWS[namespace]?.[key] ?? {
      issues: [],
      // The self-check namespace is intentionally empty: in mock mode Part 1's
      // output is these same fixtures, which are correct by construction, so
      // there is nothing for the judgment layer to find. The deterministic
      // checks still run against them for real.
      reasoning: 'No judgment-layer issues (mock mode).',
    }
  )
}

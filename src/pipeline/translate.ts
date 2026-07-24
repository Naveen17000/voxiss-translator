import { callStructured, type CallStats } from './claude'
import { findAmbiguousSources } from './checks'
import { ROLE_EXPECTATION, inferUiRole } from './uiRole'
import { mockTranslate } from './mock'
import type { Glossary, SourceString, TranslationResult } from './types'

const TRANSLATION_SCHEMA = {
  type: 'object',
  properties: {
    translation: { type: 'string', description: 'The Spanish string, exactly as it should appear in the UI.' },
    alternatives_considered: {
      type: 'array',
      description: 'Other renderings you weighed and rejected. Empty only if the string is genuinely unambiguous.',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          rejected_because: { type: 'string' },
        },
        required: ['text', 'rejected_because'],
        additionalProperties: false,
      },
    },
    disambiguation_note: {
      type: 'string',
      description:
        'One or two sentences a non-technical reviewer can read: which sense of the English you chose and what in the context told you.',
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    assumptions: {
      type: 'array',
      description: 'Anything you had to assume because the context did not say. Empty if nothing.',
      items: { type: 'string' },
    },
  },
  required: ['translation', 'alternatives_considered', 'disambiguation_note', 'confidence', 'assumptions'],
  additionalProperties: false,
}

const SYSTEM = `You translate user-interface strings from English into Spanish for a B2B SaaS product.

You are not translating prose. You are translating a string that will appear in a specific UI element, and the grammatical form has to match that element. A button needs an infinitive; a status readout needs an adjective; a field label needs a noun phrase. Getting the dictionary meaning right and the form wrong still produces a broken interface.

Short English UI strings are frequently ambiguous in ways the word alone cannot resolve. "Open" is a command on a button and a state on a status label. "Post" is a verb in a social feed and a noun about physical mail. You are given the string's key and the developer's comment precisely so you can resolve this — use them, and do not fall back on the most common sense of the word.

Write the Spanish a native speaker would expect to see in a product of this kind: natural, concise, and consistent with normal Spanish software conventions. Use neutral international Spanish unless the context says otherwise.

Explain your reasoning in terms a non-technical reviewer can follow. No linguistics jargon.`

interface TranslateOneArgs {
  entry: SourceString
  siblings: SourceString[]
  ambiguousWith: string[]
  glossary: Glossary
  stats: CallStats
  mode: 'live' | 'mock'
}

async function translateOne({
  entry,
  siblings,
  ambiguousWith,
  glossary,
  stats,
  mode,
}: TranslateOneArgs): Promise<TranslationResult> {
  const uiRole = inferUiRole(entry.key)
  const isAmbiguous = ambiguousWith.length > 0

  const collisions = siblings.filter((s) => ambiguousWith.includes(s.key))

  const ambiguityBlock = isAmbiguous
    ? `
AMBIGUITY DETECTED IN THIS BATCH
The exact English text "${entry.source}" also appears under ${collisions.length === 1 ? 'another key' : 'other keys'} in this same batch:
${collisions
  .map((c) => `  - ${c.key} (${inferUiRole(c.key)}): ${c.comment}`)
  .join('\n')}

These must not receive the same Spanish translation unless they genuinely mean the same thing. Translate the string you were asked about, for its own context. Say in your disambiguation note how it differs from the other use.`
    : ''

  const glossaryBlock =
    glossary.mandated.length || glossary.doNotTranslate.length
      ? `
GLOSSARY
${glossary.mandated.map((m) => `  - "${m.source}" must be translated as "${m.target}"${m.note ? ` (${m.note})` : ''}`).join('\n')}
${glossary.doNotTranslate.map((t) => `  - "${t}" must be left in English`).join('\n')}`
      : ''

  const user = `STRING TO TRANSLATE

  Key:               ${entry.key}
  English:           ${entry.source}
  Developer comment: ${entry.comment}

UI ELEMENT (derived from the key, not a guess)
  Type:     ${uiRole}
  Requires: ${ROLE_EXPECTATION[uiRole]}
${ambiguityBlock}
${glossaryBlock}

OTHER STRINGS IN THIS BATCH (for consistency of terminology and tone)
${siblings.map((s) => `  ${s.key} — "${s.source}" — ${s.comment}`).join('\n')}

Translate into Spanish.`

  const raw =
    mode === 'mock'
      ? mockTranslate(entry.key)
      : await callStructured<{
          translation: string
          alternatives_considered: { text: string; rejected_because: string }[]
          disambiguation_note: string
          confidence: 'high' | 'medium' | 'low'
          assumptions: string[]
        }>({ system: SYSTEM, user, schema: TRANSLATION_SCHEMA, stats })

  return {
    key: entry.key,
    source: entry.source,
    comment: entry.comment,
    uiRole,
    isAmbiguous,
    ambiguousWith,
    translation: raw.translation,
    alternativesConsidered: raw.alternatives_considered.map((a) => ({
      text: a.text,
      rejectedBecause: a.rejected_because,
    })),
    disambiguationNote: raw.disambiguation_note,
    confidence: raw.confidence,
    assumptions: raw.assumptions,
  }
}

export async function translateBatch(
  strings: SourceString[],
  glossary: Glossary,
  stats: CallStats,
  mode: 'live' | 'mock',
): Promise<TranslationResult[]> {
  const ambiguity = findAmbiguousSources(strings)

  // One call per string rather than one call for the batch. It costs more, but
  // a malformed response loses one string instead of ten, and each string gets
  // the model's full attention on its own disambiguation. They run concurrently,
  // so wall-clock is roughly one call.
  return Promise.all(
    strings.map((entry) =>
      translateOne({
        entry,
        siblings: strings.filter((s) => s.key !== entry.key),
        ambiguousWith: ambiguity.get(entry.key) ?? [],
        glossary,
        stats,
        mode,
      }),
    ),
  )
}

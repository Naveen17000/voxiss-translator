import { MODEL_ISSUE_TYPES, ISSUE_CATALOG } from './config'
import { callStructured, type CallStats } from './claude'
import { findAmbiguousSources, findConsistencyIssues, runDeterministicChecks } from './checks'
import { ROLE_EXPECTATION, inferUiRole } from './uiRole'
import { verdict } from './scoring'
import { mockScore } from './mock'
import type { ExistingTranslation, Glossary, Issue, IssueType, ScoreResult, SourceString } from './types'

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      description: 'Every problem you can substantiate. Empty array if the translation is correct.',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: MODEL_ISSUE_TYPES },
          explanation: {
            type: 'string',
            description: 'One sentence a non-technical reviewer can act on. No linguistics jargon.',
          },
          evidence: {
            type: 'string',
            description: 'The specific word or phrase at fault, quoted, so a human can check your claim.',
          },
          suggestion: { type: 'string', description: 'The Spanish you would use instead.' },
        },
        required: ['type', 'explanation', 'evidence', 'suggestion'],
        additionalProperties: false,
      },
    },
    reasoning: {
      type: 'string',
      description: 'Brief note on how you read this string in context. Shown to the reviewer alongside the issues.',
    },
  },
  required: ['issues', 'reasoning'],
  additionalProperties: false,
}

const SYSTEM = `You review Spanish translations of user-interface strings and report defects.

You do not assign scores, grades, ratings, or numbers of any kind. Your only job is to find real problems and classify each one into the fixed set of categories you are given. Severity and scoring are decided downstream by a fixed policy, not by you — so a category is all that is needed from you, and inventing your own severity would be discarded.

Report only what you can substantiate by quoting the offending text. Do not report stylistic preferences as defects. If the translation is correct for its context, return an empty issues array — that is a normal and expected result, not a failure to find something.

Be especially alert to two failure modes that a translator without product context cannot avoid:

  - wrong_sense: the English word has several meanings and the wrong one was chosen. This is the signature failure of any process that translates a string list without knowing where the strings appear.
  - ui_role_mismatch: the meaning is right but the grammatical form does not fit the element. A button labelled with an adjective, or a status readout labelled with a command, is broken even though a dictionary would call the word correct.

Mechanical properties — placeholders, HTML tags, glossary terms, whitespace, string length, consistency with the rest of the batch — have already been verified in code before you were called. Do not comment on them. Judge meaning, grammatical form, register, and fluency only.`

interface ReviewRow {
  key: string
  source: string
  target: string
  comment: string | null
}

/** What comes back over the wire — deliberately loose, validated below. */
interface RawIssue {
  type: string
  explanation: string
  evidence: string
  suggestion: string
}
interface RawReview {
  issues: RawIssue[]
  reasoning: string
}

function isModelIssueType(t: string): t is IssueType {
  return (MODEL_ISSUE_TYPES as string[]).includes(t)
}

async function reviewOne(
  row: ReviewRow,
  siblings: ReviewRow[],
  ambiguousWith: string[],
  stats: CallStats,
  mode: 'live' | 'mock',
  mockNamespace: string,
): Promise<{ issues: Issue[]; reasoning: string }> {
  const uiRole = inferUiRole(row.key)

  const collisions = siblings.filter((s) => ambiguousWith.includes(s.key))
  const ambiguityBlock = collisions.length
    ? `
AMBIGUITY DETECTED IN THIS BATCH
The same English text also appears under:
${collisions.map((c) => `  - ${c.key}: "${c.target}"${c.comment ? ` — ${c.comment}` : ''}`).join('\n')}
Both may legitimately be correct for their own contexts. Judge only the one you were asked about.`
    : ''

  const categories = MODEL_ISSUE_TYPES.map((t) => `  - ${t}: ${ISSUE_CATALOG[t as IssueType].meaning}`).join('\n')

  const user = `TRANSLATION TO REVIEW

  Key:               ${row.key}
  English:           ${row.source}
  Spanish:           ${row.target}
  Developer comment: ${row.comment ?? '(none supplied — judge from the key alone and say so in your reasoning)'}

UI ELEMENT (derived from the key, not a guess)
  Type:     ${uiRole}
  Requires: ${ROLE_EXPECTATION[uiRole]}
${ambiguityBlock}

CATEGORIES YOU MAY USE
${categories}

Review this translation.`

  const raw =
    mode === 'mock'
      ? mockScore(mockNamespace, row.key)
      : await callStructured<RawReview>({ system: SYSTEM, user, schema: REVIEW_SCHEMA, stats })

  const issues: Issue[] = raw.issues
    // The schema constrains `type` to the model-judged categories, but this is
    // still model output crossing a trust boundary, so it gets checked rather
    // than asserted. Anything unrecognised is dropped, not scored.
    .filter((i): i is RawIssue & { type: IssueType } => isModelIssueType(i.type))
    // Severity is never taken from the model. It is looked up from the policy
    // table by category, so the same category always costs the same.
    .map((i) => ({
      type: i.type,
      severity: ISSUE_CATALOG[i.type].severity,
      source: 'model' as const,
      explanation: i.explanation,
      evidence: i.evidence,
      suggestion: i.suggestion || null,
    }))

  return { issues, reasoning: raw.reasoning }
}

export interface ScoreBatchInput {
  rows: ExistingTranslation[]
  /** The string catalogue, used to recover developer context by key. */
  catalogue: SourceString[]
  glossary: Glossary
  stats: CallStats
  mode: 'live' | 'mock'
  /** Distinguishes the Part 2 batch from the self-check in mock fixtures. */
  mockNamespace: string
}

export async function scoreBatch({
  rows,
  catalogue,
  glossary,
  stats,
  mode,
  mockNamespace,
}: ScoreBatchInput): Promise<ScoreResult[]> {
  const byKey = new Map(catalogue.map((c) => [c.key, c]))
  const ambiguity = findAmbiguousSources(rows)

  const enriched: ReviewRow[] = rows.map((r) => ({
    key: r.key,
    source: r.source,
    target: r.target,
    comment: byKey.get(r.key)?.comment ?? null,
  }))

  // Cross-batch consistency needs the whole batch, so it runs once up front.
  const consistency = findConsistencyIssues(
    rows.map((r) => ({
      key: r.key,
      source: r.source,
      target: r.target,
      uiRole: inferUiRole(r.key),
      isAmbiguous: (ambiguity.get(r.key) ?? []).length > 0,
    })),
  )

  const reviews = await Promise.all(
    enriched.map((row) =>
      reviewOne(
        row,
        enriched.filter((s) => s.key !== row.key),
        ambiguity.get(row.key) ?? [],
        stats,
        mode,
        mockNamespace,
      ),
    ),
  )

  return enriched.map((row, i) => {
    const uiRole = inferUiRole(row.key)

    const ruleIssues = runDeterministicChecks({
      key: row.key,
      source: row.source,
      target: row.target,
      uiRole,
      glossary,
      isAmbiguous: (ambiguity.get(row.key) ?? []).length > 0,
    })

    const issues = [...ruleIssues, ...(consistency.get(row.key) ?? []), ...reviews[i].issues]
    const v = verdict(issues)

    return {
      key: row.key,
      source: row.source,
      target: row.target,
      comment: row.comment,
      contextRecovered: row.comment !== null,
      uiRole,
      issues,
      score: v.score,
      band: v.band,
      action: v.action,
      forcedToHuman: v.forcedToHuman,
    }
  })
}

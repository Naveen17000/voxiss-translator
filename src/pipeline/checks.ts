import { ISSUE_CATALOG, LENGTH_BUDGET, LENGTH_CHECK_MIN_CHARS } from './config'
import type { Glossary, Issue, IssueType, UiRole } from './types'

/**
 * DETERMINISTIC CHECKS
 *
 * Everything in this file is decidable by code. None of it is sent to Claude.
 *
 * That split is the point. Placeholder integrity, markup integrity, glossary
 * compliance and cross-batch consistency have exactly one right answer, so
 * asking a model for an opinion on them only adds cost, latency and the chance
 * of a confident wrong answer. The model is spent on the part that genuinely
 * needs judgment.
 */

function issue(
  type: IssueType,
  explanation: string,
  evidence: string,
  suggestion: string | null = null,
): Issue {
  const spec = ISSUE_CATALOG[type]
  return { type, severity: spec.severity, source: spec.source, explanation, evidence, suggestion }
}

/** {name} {{name}} %s %d %1$s $name <0> :name — the common families. */
const PLACEHOLDER_RE = /(\{\{[^}]+\}\}|\{[^}]*\}|%\d+\$[sd]|%[sd]|\$[A-Za-z_][A-Za-z0-9_]*|<\d+\s*\/?>|:[A-Za-z_][A-Za-z0-9_]*)/g
const TAG_RE = /<\/?[A-Za-z][^>]*>/g

function multiset(items: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1)
  return m
}

function diffMultisets(a: Map<string, number>, b: Map<string, number>): string[] {
  const out: string[] = []
  for (const [k, n] of a) {
    const got = b.get(k) ?? 0
    if (got < n) out.push(`missing ${k}${n > 1 ? ` ×${n - got}` : ''}`)
  }
  for (const [k, n] of b) {
    const had = a.get(k) ?? 0
    if (had < n) out.push(`unexpected ${k}${n > 1 ? ` ×${n - had}` : ''}`)
  }
  return out
}

/**
 * Spanish runs longer than English, and the shorter the string the wilder the
 * ratio: a correct 7-character translation of a 4-character word is a 1.75x
 * expansion but is not an overflow risk. So the allowance is the larger of a
 * proportional budget and a flat headroom — which is how translation memory
 * tools handle it too.
 */
function lengthAllowance(sourceLength: number, role: UiRole): number {
  return Math.max(sourceLength * LENGTH_BUDGET[role], sourceLength + 10)
}

export interface CheckInput {
  key: string
  source: string
  target: string
  uiRole: UiRole
  glossary: Glossary
  /** Set when the batch has already established this source text is context-ambiguous. */
  isAmbiguous: boolean
}

export function runDeterministicChecks(input: CheckInput): Issue[] {
  const { source, target, uiRole, glossary } = input
  const issues: Issue[] = []

  if (!target || target.trim() === '') {
    // Nothing else is meaningful once the string is empty.
    return [issue('empty_target', 'This string has no Spanish translation at all.', '(empty)', null)]
  }

  // --- left in English ---
  const dnt = new Set(glossary.doNotTranslate.map((t) => t.toLowerCase()))
  const mandatedIdentity = glossary.mandated.some(
    (m) => m.source.toLowerCase() === m.target.toLowerCase() && source.toLowerCase().includes(m.source.toLowerCase()),
  )
  if (
    source.trim().toLowerCase() === target.trim().toLowerCase() &&
    source.trim().length > 1 &&
    !dnt.has(source.trim().toLowerCase()) &&
    !mandatedIdentity
  ) {
    issues.push(
      issue(
        'untranslated',
        'The Spanish is identical to the English, and this is not a term the glossary says to leave alone.',
        target,
        null,
      ),
    )
  }

  // --- placeholders ---
  const srcPlaceholders = multiset(source.match(PLACEHOLDER_RE) ?? [])
  const tgtPlaceholders = multiset(target.match(PLACEHOLDER_RE) ?? [])
  const placeholderDiff = diffMultisets(srcPlaceholders, tgtPlaceholders)
  if (placeholderDiff.length > 0) {
    issues.push(
      issue(
        'placeholder_mismatch',
        'The variables in this string do not match the English. The app will show broken text or crash on this line.',
        placeholderDiff.join(', '),
        'Restore the placeholders exactly as they appear in the source.',
      ),
    )
  }

  // --- markup ---
  const tagDiff = diffMultisets(multiset(source.match(TAG_RE) ?? []), multiset(target.match(TAG_RE) ?? []))
  if (tagDiff.length > 0) {
    issues.push(
      issue('tag_mismatch', 'The formatting tags do not match the English, so this will not render correctly.', tagDiff.join(', '), null),
    )
  }

  // --- glossary ---
  for (const term of glossary.mandated) {
    if (!new RegExp(`\\b${escapeRe(term.source)}\\b`, 'i').test(source)) continue
    if (!new RegExp(`\\b${escapeRe(term.target)}\\b`, 'i').test(target)) {
      issues.push(
        issue(
          'glossary_violation',
          `The glossary requires "${term.source}" to be translated as "${term.target}" and this string does not use it.`,
          `expected "${term.target}" in "${target}"`,
          `Use "${term.target}".`,
        ),
      )
    }
  }
  for (const term of glossary.doNotTranslate) {
    if (!new RegExp(`\\b${escapeRe(term)}\\b`, 'i').test(source)) continue
    if (!new RegExp(`\\b${escapeRe(term)}\\b`, 'i').test(target)) {
      issues.push(
        issue(
          'glossary_violation',
          `"${term}" must appear untranslated in the Spanish and it is missing.`,
          `expected "${term}" in "${target}"`,
          `Keep "${term}" as is.`,
        ),
      )
    }
  }

  // --- whitespace ---
  const srcPad = [/^\s/.test(source), /\s$/.test(source)]
  const tgtPad = [/^\s/.test(target), /\s$/.test(target)]
  if (srcPad[0] !== tgtPad[0] || srcPad[1] !== tgtPad[1]) {
    issues.push(issue('whitespace_mismatch', 'Leading or trailing spaces do not match the English.', JSON.stringify(target), null))
  }

  // --- trailing punctuation ---
  const srcEnd = source.trim().match(/[.!?:;]$/)?.[0] ?? ''
  const tgtEnd = target.trim().match(/[.!?:;]$/)?.[0] ?? ''
  if (srcEnd !== tgtEnd) {
    issues.push(
      issue(
        'punctuation_mismatch',
        `The English ends with "${srcEnd || 'no punctuation'}" and the Spanish ends with "${tgtEnd || 'no punctuation'}".`,
        target,
        null,
      ),
    )
  }

  // --- length ---
  if (source.trim().length >= LENGTH_CHECK_MIN_CHARS) {
    const allowed = lengthAllowance(source.trim().length, uiRole)
    if (target.trim().length > allowed) {
      issues.push(
        issue(
          'length_overflow',
          `At ${target.trim().length} characters against ${source.trim().length} in English, this may not fit the space it is shown in.`,
          `${target.trim().length} chars, budget ${Math.round(allowed)}`,
          null,
        ),
      )
    }
  }

  return issues
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Cross-batch consistency. Runs over the whole batch, not one string.
 *
 * The subtlety: identical English translated two different ways is only a
 * defect when the English means the same thing both times. This batch contains
 * "Due" as a deadline and "Due" as an amount owed — translating those
 * differently is correct, and a naive consistency check would report both as
 * errors. So ambiguity detection suppresses this check: if a source string has
 * already been identified as context-ambiguous, divergent translations are
 * expected rather than inconsistent.
 */
export function findConsistencyIssues(
  rows: { key: string; source: string; target: string; uiRole: UiRole; isAmbiguous: boolean }[],
): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>()
  const groups = new Map<string, typeof rows>()

  for (const row of rows) {
    if (row.isAmbiguous) continue // context-ambiguous: divergence is expected
    const bucket = `${row.source.trim().toLowerCase()}::${row.uiRole}`
    groups.set(bucket, [...(groups.get(bucket) ?? []), row])
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue
    const distinct = new Set(group.map((r) => r.target.trim().toLowerCase()))
    if (distinct.size < 2) continue
    for (const row of group) {
      const others = group.filter((r) => r.key !== row.key).map((r) => `${r.key} → "${r.target}"`)
      out.set(row.key, [
        ...(out.get(row.key) ?? []),
        issue(
          'terminology_inconsistency',
          `"${row.source}" is translated as "${row.target}" here but differently elsewhere in the same kind of UI element.`,
          others.join('; '),
          'Pick one translation and use it everywhere.',
        ),
      ])
    }
  }

  return out
}

/**
 * Ambiguity detection — deterministic, and the input to everything downstream.
 *
 * If the same English text appears under more than one key, the batch itself
 * proves the word is context-dependent. Code establishes that fact; the model
 * is then asked to resolve it rather than to notice it.
 */
export function findAmbiguousSources(rows: { key: string; source: string }[]): Map<string, string[]> {
  const bySource = new Map<string, string[]>()
  for (const r of rows) {
    const norm = r.source.trim().toLowerCase()
    bySource.set(norm, [...(bySource.get(norm) ?? []), r.key])
  }

  const out = new Map<string, string[]>()
  for (const r of rows) {
    const siblings = (bySource.get(r.source.trim().toLowerCase()) ?? []).filter((k) => k !== r.key)
    if (siblings.length > 0) out.set(r.key, siblings)
  }
  return out
}

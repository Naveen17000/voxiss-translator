import { SEVERITY_PENALTY, scoreToBand } from './config'
import type { Band, Issue } from './types'

/**
 * The score is arithmetic over the issue list. No model, no weighting heuristics,
 * no rounding surprises. Two people reading the same report get the same number,
 * and so does the same input a month later.
 */
export function computeScore(issues: Issue[]): number {
  const penalty = issues.reduce((sum, i) => sum + SEVERITY_PENALTY[i.severity], 0)
  return Math.max(0, 100 - penalty)
}

export interface Verdict {
  score: number
  band: Band
  action: string
  forcedToHuman: boolean
}

export function verdict(issues: Issue[]): Verdict {
  const score = computeScore(issues)
  const { band, action } = scoreToBand(score)

  // A single critical issue means a human looks at it, whatever the arithmetic
  // says. Placeholder damage and wrong-sense errors are not the kind of thing
  // that should be averaged away by an otherwise clean string.
  const hasCritical = issues.some((i) => i.severity === 'critical')

  return {
    score,
    band,
    action: hasCritical && band !== 'reject' ? `${action} — critical issue, human review required` : action,
    forcedToHuman: hasCritical || score < 90,
  }
}

/** Shown in the report so a reviewer can follow the arithmetic. */
export function explainScore(issues: Issue[]): string {
  if (issues.length === 0) return '100 — no issues found'
  const parts = issues.map((i) => `−${SEVERITY_PENALTY[i.severity]} ${i.type.replace(/_/g, ' ')}`)
  return `100 ${parts.join(' ')} = ${computeScore(issues)}`
}

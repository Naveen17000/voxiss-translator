/**
 * The scoring policy. The central claim of this design is that the number is
 * arithmetic over an issue list rather than a model opinion — so it should be
 * possible to assert exact values.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { computeScore, explainScore, verdict } from '../src/pipeline/scoring'
import { ISSUE_CATALOG, MODEL_ISSUE_TYPES, SEVERITY_PENALTY, scoreToBand } from '../src/pipeline/config'
import type { Issue, IssueType, Severity } from '../src/pipeline/types'

const issue = (type: IssueType): Issue => ({
  type,
  severity: ISSUE_CATALOG[type].severity,
  source: ISSUE_CATALOG[type].source,
  explanation: '',
  evidence: '',
  suggestion: null,
})

test('a clean string scores 100', () => {
  assert.equal(computeScore([]), 100)
})

test('penalties are additive and match the published table', () => {
  assert.equal(computeScore([issue('wrong_sense')]), 60) // critical, -40
  assert.equal(computeScore([issue('meaning_shift')]), 75) // major, -25
  assert.equal(computeScore([issue('fluency')]), 90) // minor, -10
  assert.equal(computeScore([issue('punctuation_mismatch')]), 97) // nit, -3
  assert.equal(computeScore([issue('wrong_sense'), issue('ui_role_mismatch')]), 35)
})

test('the score floors at zero rather than going negative', () => {
  const many = Array.from({ length: 6 }, () => issue('wrong_sense'))
  assert.equal(computeScore(many), 0)
})

test('the reported arithmetic reconciles with the score', () => {
  const issues = [issue('ui_role_mismatch'), issue('wrong_sense')]
  assert.equal(explainScore(issues), '100 −25 ui role mismatch −40 wrong sense = 35')
  assert.ok(explainScore(issues).endsWith(`= ${computeScore(issues)}`))
})

test('bands map to the documented thresholds', () => {
  assert.equal(scoreToBand(100).band, 'approve')
  assert.equal(scoreToBand(90).band, 'approve')
  assert.equal(scoreToBand(89).band, 'review')
  assert.equal(scoreToBand(70).band, 'review')
  assert.equal(scoreToBand(69).band, 'fix')
  assert.equal(scoreToBand(50).band, 'fix')
  assert.equal(scoreToBand(49).band, 'reject')
  assert.equal(scoreToBand(0).band, 'reject')
})

test('any critical issue routes to a human regardless of the number', () => {
  // 100 - 40 = 60 lands in "fix", but the routing decision must not depend on
  // the arithmetic happening to fall below a threshold.
  const v = verdict([issue('wrong_sense')])
  assert.equal(v.forcedToHuman, true)
  assert.match(v.action, /human review required/)
})

test('a clean string is not routed to a human', () => {
  assert.equal(verdict([]).forcedToHuman, false)
})

test('anything below 90 is routed to a human even with no critical issue', () => {
  assert.equal(verdict([issue('fluency')]).forcedToHuman, false) // 90 exactly
  assert.equal(verdict([issue('fluency'), issue('punctuation_mismatch')]).forcedToHuman, true) // 87
})

test('deterministic issues are never delegated to the model, and vice versa', () => {
  // The split is the design. A drift here would mean either paying for a model
  // opinion on a decidable question, or trusting the model on one it was told
  // not to judge.
  const ruleOnly: IssueType[] = [
    'empty_target',
    'untranslated',
    'placeholder_mismatch',
    'tag_mismatch',
    'glossary_violation',
    'terminology_inconsistency',
    'whitespace_mismatch',
    'punctuation_mismatch',
    'length_overflow',
  ]
  for (const t of ruleOnly) assert.equal(ISSUE_CATALOG[t].source, 'rule', t)
  for (const t of MODEL_ISSUE_TYPES) assert.equal(ISSUE_CATALOG[t].source, 'model', t)
  assert.deepEqual(
    MODEL_ISSUE_TYPES.slice().sort(),
    ['fluency', 'meaning_shift', 'register_mismatch', 'ui_role_mismatch', 'wrong_sense'].sort(),
  )
})

test('every category carries a severity the penalty table knows about', () => {
  for (const [type, spec] of Object.entries(ISSUE_CATALOG)) {
    assert.ok(SEVERITY_PENALTY[spec.severity as Severity] > 0, `${type} has an unusable severity`)
    assert.ok(spec.label.length > 0, `${type} needs a reviewer-facing label`)
    assert.ok(spec.meaning.length > 0, `${type} needs a plain-English meaning`)
  }
})

/**
 * Whole-pipeline run against fixtures. Asserts the outcomes a reviewer will
 * actually read, so a regression anywhere in the chain surfaces as a wrong
 * number rather than a silently different report.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { runPipeline } from '../src/pipeline/run'
import { renderMarkdown } from '../src/pipeline/report'
import { computeScore } from '../src/pipeline/scoring'
import type { PipelineRun } from '../src/pipeline/types'

let run: PipelineRun
test('pipeline runs end to end', async () => {
  run = await runPipeline('mock')
  assert.equal(run.meta.mode, 'mock')
  assert.equal(run.meta.apiCalls, 0, 'mock mode must not touch the network')
})

test('all 10 strings are translated and none is empty', () => {
  assert.equal(run.translations.length, 10)
  for (const t of run.translations) {
    assert.ok(t.translation.trim().length > 0, `${t.key} produced no translation`)
    assert.notEqual(t.translation, '(no fixture)', `${t.key} is missing a fixture`)
    assert.ok(t.disambiguationNote.trim().length > 0, `${t.key} has no explanation for the reviewer`)
  }
})

test('the three ambiguous words are detected and resolved differently', () => {
  const byKey = new Map(run.translations.map((t) => [t.key, t]))
  const pairs: [string, string][] = [
    ['ticket.button.open', 'settings.hours.status_label_open'],
    ['feed.button.post', 'mail.label.post'],
    ['ticket.field.due', 'invoice.field.amount_due'],
  ]
  for (const [a, b] of pairs) {
    const ta = byKey.get(a)!
    const tb = byKey.get(b)!
    assert.ok(ta.isAmbiguous && tb.isAmbiguous, `${a} / ${b} should be flagged ambiguous`)
    assert.ok(ta.ambiguousWith.includes(b), `${a} should point at ${b}`)
    assert.notEqual(
      ta.translation.toLowerCase(),
      tb.translation.toLowerCase(),
      `${a} and ${b} share an English word but must not share a translation`,
    )
  }
})

test('the two catastrophic existing translations are caught', () => {
  const byKey = new Map(run.scores.map((s) => [s.key, s]))

  const open = byKey.get('ticket.button.open')!
  assert.equal(open.target, 'Abierto')
  assert.ok(open.score < 50, `expected a rejecting score, got ${open.score}`)
  assert.ok(open.issues.some((i) => i.type === 'wrong_sense'))
  assert.ok(open.issues.some((i) => i.type === 'ui_role_mismatch'))
  assert.equal(open.forcedToHuman, true)

  const post = byKey.get('feed.button.post')!
  assert.equal(post.target, 'Correo')
  assert.ok(post.score < 50, `expected a rejecting score, got ${post.score}`)
  assert.ok(post.issues.some((i) => i.type === 'wrong_sense'))
})

test('the subtle one is caught but scored less harshly', () => {
  const due = run.scores.find((s) => s.key === 'invoice.field.amount_due')!
  assert.equal(due.target, 'Vencido')
  assert.ok(due.issues.some((i) => i.type === 'meaning_shift'))
  assert.ok(due.score > 50 && due.score < 90, `expected a middling score, got ${due.score}`)
})

test('the five correct translations are not flagged', () => {
  const clean = ['ticket.button.close', 'ticket.field.due', 'ticket.button.assign', 'ticket.button.share', 'report.button.export']
  for (const key of clean) {
    const s = run.scores.find((x) => x.key === key)!
    assert.deepEqual(s.issues, [], `${key} ("${s.target}") was flagged but is correct`)
    assert.equal(s.score, 100)
  }
})

test('no false-positive consistency flag on the two "Due" rows', () => {
  for (const key of ['ticket.field.due', 'invoice.field.amount_due']) {
    const s = run.scores.find((x) => x.key === key)!
    assert.ok(
      !s.issues.some((i) => i.type === 'terminology_inconsistency'),
      `${key} must not be penalised for diverging from the other "Due"`,
    )
  }
})

test('every score reconciles with its own issue list', () => {
  for (const s of [...run.scores, ...run.selfCheck]) {
    assert.equal(s.score, computeScore(s.issues), `${s.key} score does not match its issues`)
  }
})

test('developer context was recovered for every scored row', () => {
  for (const s of run.scores) {
    assert.equal(s.contextRecovered, true, `${s.key} lost its developer comment`)
  }
})

test('the self-check runs the scorer over the pipeline own output', () => {
  assert.equal(run.selfCheck.length, 10)
  const translated = new Map(run.translations.map((t) => [t.key, t.translation]))
  for (const s of run.selfCheck) {
    assert.equal(s.target, translated.get(s.key), `${s.key} self-check must score the produced translation`)
  }
})

test('summary counts agree with the underlying rows', () => {
  const { summary, scores } = run
  assert.equal(summary.translated, run.translations.length)
  assert.equal(summary.scored, scores.length)
  assert.equal(summary.flagged, scores.filter((s) => s.issues.length > 0).length)
  assert.equal(summary.clean, scores.filter((s) => s.issues.length === 0).length)
  assert.equal(summary.clean + summary.flagged, summary.scored)
  assert.equal(summary.needsHuman, scores.filter((s) => s.forcedToHuman).length)
})

test('the markdown report renders with the findings in it', () => {
  const md = renderMarkdown(run)
  assert.match(md, /Part 1 — Translations/)
  assert.match(md, /Part 2 — Quality scores/)
  assert.match(md, /Self-check/)
  assert.match(md, /Fixture run/, 'a fixture run must say so in the report')
  for (const t of run.translations) assert.ok(md.includes(t.translation), `${t.key} missing from report`)
  for (const s of run.scores) assert.ok(md.includes(s.key), `${s.key} missing from report`)
})

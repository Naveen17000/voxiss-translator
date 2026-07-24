/**
 * Fidelity to the task brief.
 *
 * The expected values below are transcribed from the Round 2 task, not from the
 * data files, so this fails if a string is ever silently edited to make the
 * pipeline look better.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { loadInputs } from '../src/pipeline/run'

const BRIEF_PART1: [string, string, string][] = [
  ['ticket.button.open', 'Open', 'Button an agent clicks to open a closed support ticket back up'],
  ['settings.hours.status_label_open', 'Open', 'Label shown when the support desk is currently open for business'],
  ['ticket.button.close', 'Close', 'Button an agent clicks to mark a ticket as resolved/closed'],
  ['feed.button.post', 'Post', 'Button to publish a new post to the internal team feed'],
  ['mail.label.post', 'Post', 'Label for a physical mail correspondence address field'],
  ['ticket.button.assign', 'Assign', 'Button to assign a ticket to a specific agent'],
  ['ticket.field.due', 'Due', 'Field showing the due date/deadline for resolving a ticket'],
  ['invoice.field.amount_due', 'Due', 'Field showing the amount of money owed on an invoice'],
  ['ticket.button.share', 'Share', "Button to share a ticket's link with another teammate"],
  ['report.button.export', 'Export', 'Button to export a report as a CSV or PDF file'],
]

const BRIEF_PART2: [string, string, string][] = [
  ['ticket.button.open', 'Open', 'Abierto'],
  ['ticket.button.close', 'Close', 'Cerrar'],
  ['invoice.field.amount_due', 'Due', 'Vencido'],
  ['ticket.field.due', 'Due', 'Vencimiento'],
  ['ticket.button.assign', 'Assign', 'Asignar'],
  ['ticket.button.share', 'Share', 'Compartir'],
  ['feed.button.post', 'Post', 'Correo'],
  ['report.button.export', 'Export', 'Exportar'],
]

test('Part 1 input matches the brief exactly', () => {
  const { strings } = loadInputs()
  assert.equal(strings.length, 10, 'the brief lists 10 source strings')
  for (const [i, [key, source, comment]] of BRIEF_PART1.entries()) {
    assert.equal(strings[i].key, key, `row ${i + 1} key`)
    assert.equal(strings[i].source, source, `row ${i + 1} source`)
    assert.equal(strings[i].comment, comment, `row ${i + 1} comment`)
  }
})

test('Part 2 input matches the brief exactly', () => {
  const { translations } = loadInputs()
  assert.equal(translations.length, 8, 'the brief lists 8 existing translations')
  for (const [i, [key, source, target]] of BRIEF_PART2.entries()) {
    assert.equal(translations[i].key, key, `row ${i + 1} key`)
    assert.equal(translations[i].source, source, `row ${i + 1} source`)
    assert.equal(translations[i].target, target, `row ${i + 1} target`)
  }
})

test('every Part 2 key can recover developer context from the catalogue', () => {
  const { strings, translations } = loadInputs()
  const known = new Set(strings.map((s) => s.key))
  for (const t of translations) {
    assert.ok(known.has(t.key), `${t.key} should join to the string catalogue`)
  }
})

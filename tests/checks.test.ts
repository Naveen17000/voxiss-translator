/**
 * The deterministic layer. These are the checks that must be right every time,
 * so they are tested directly rather than inferred from a pipeline run — including
 * the glossary path, which the 18 brief strings never exercise.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { findAmbiguousSources, findConsistencyIssues, runDeterministicChecks } from '../src/pipeline/checks'
import { inferUiRole } from '../src/pipeline/uiRole'
import type { Glossary, UiRole } from '../src/pipeline/types'

const GLOSSARY: Glossary = {
  locale: 'es',
  mandated: [{ source: 'invoice', target: 'factura' }],
  doNotTranslate: ['CSV', 'Voxiis'],
}

function check(source: string, target: string, uiRole: UiRole = 'label') {
  return runDeterministicChecks({ key: 'x.y.z', source, target, uiRole, glossary: GLOSSARY, isAmbiguous: false })
}

const types = (source: string, target: string, role: UiRole = 'label') => check(source, target, role).map((i) => i.type)

// ---------------------------------------------------------------- ui role

test('the UI element is derived correctly from every key in the brief', () => {
  const expected: Record<string, UiRole> = {
    'ticket.button.open': 'action',
    'ticket.button.close': 'action',
    'ticket.button.assign': 'action',
    'ticket.button.share': 'action',
    'feed.button.post': 'action',
    'report.button.export': 'action',
    'settings.hours.status_label_open': 'state',
    'mail.label.post': 'label',
    'ticket.field.due': 'label',
    'invoice.field.amount_due': 'label',
  }
  for (const [key, role] of Object.entries(expected)) {
    assert.equal(inferUiRole(key), role, key)
  }
})

test('"status" beats "label" when a key contains both', () => {
  // settings.hours.status_label_open is the reason this ordering exists: read as
  // a label it would demand a noun, and the correct answer "Abierto" would be
  // flagged as wrong.
  assert.equal(inferUiRole('settings.hours.status_label_open'), 'state')
  assert.equal(inferUiRole('a.status_label'), 'state')
  assert.equal(inferUiRole('a.label'), 'label')
})

test('unclassifiable keys degrade to unknown rather than guessing', () => {
  assert.equal(inferUiRole('some.random.key'), 'unknown')
  assert.equal(inferUiRole(''), 'unknown')
})

// ---------------------------------------------------------- placeholders

test('placeholder loss is caught', () => {
  assert.ok(types('Hello {name}', 'Hola').includes('placeholder_mismatch'))
  assert.ok(types('You have {count} of {total}', 'Tienes {count}').includes('placeholder_mismatch'))
  assert.ok(types('Hi %s', 'Hola').includes('placeholder_mismatch'))
  assert.ok(types('Hi {{user}}', 'Hola').includes('placeholder_mismatch'))
})

test('an invented placeholder is caught', () => {
  assert.ok(types('Hello', 'Hola {name}').includes('placeholder_mismatch'))
})

test('a renamed placeholder is caught', () => {
  assert.ok(types('Hello {name}', 'Hola {nombre}').includes('placeholder_mismatch'))
})

test('correctly preserved placeholders are not flagged', () => {
  assert.ok(!types('Hello {name}, you have {count}', 'Hola {name}, tienes {count}').includes('placeholder_mismatch'))
})

test('reordered placeholders are allowed — word order differs between languages', () => {
  assert.ok(!types('{a} before {b}', '{b} después de {a}').includes('placeholder_mismatch'))
})

// ------------------------------------------------------------------ tags

test('markup damage is caught and intact markup is not', () => {
  assert.ok(types('Click <b>here</b>', 'Haz clic aquí').includes('tag_mismatch'))
  assert.ok(!types('Click <b>here</b>', 'Haz clic <b>aquí</b>').includes('tag_mismatch'))
})

// -------------------------------------------------------------- glossary

test('a mandated glossary term that was not used is caught', () => {
  // This path is never exercised by the 18 brief strings, so it is proven here.
  const t = types('Delete invoice', 'Eliminar recibo')
  assert.ok(t.includes('glossary_violation'), `expected glossary_violation, got ${t.join(',')}`)
})

test('a mandated glossary term that was used is not flagged', () => {
  assert.ok(!types('Delete invoice', 'Eliminar factura').includes('glossary_violation'))
})

test('do-not-translate terms must survive into the target', () => {
  assert.ok(types('Export as CSV', 'Exportar como valores separados').includes('glossary_violation'))
  assert.ok(!types('Export as CSV', 'Exportar como CSV').includes('glossary_violation'))
})

// ---------------------------------------------------------- untranslated

test('a string left in English is caught', () => {
  assert.ok(types('Settings', 'Settings').includes('untranslated'))
})

test('a do-not-translate term identical in both languages is not called untranslated', () => {
  assert.ok(!types('CSV', 'CSV').includes('untranslated'))
  assert.ok(!types('Voxiis', 'Voxiis').includes('untranslated'))
})

test('an empty target short-circuits to a single critical issue', () => {
  const issues = check('Save', '')
  assert.equal(issues.length, 1)
  assert.equal(issues[0].type, 'empty_target')
  assert.equal(issues[0].severity, 'critical')
})

// ---------------------------------------------------- whitespace & punct

test('whitespace and trailing punctuation differences are caught', () => {
  assert.ok(types('Save ', 'Guardar').includes('whitespace_mismatch'))
  assert.ok(types('Are you sure?', 'Estás seguro').includes('punctuation_mismatch'))
  assert.ok(!types('Are you sure?', '¿Estás seguro?').includes('punctuation_mismatch'))
})

// ----------------------------------------------------------------- length

test('short strings get flat headroom, so a correct translation is not flagged', () => {
  // The regression this guards: "Open" -> "Reabrir" is a 1.75x expansion. A
  // purely proportional budget would flag the correct answer.
  assert.ok(!types('Open', 'Reabrir', 'action').includes('length_overflow'))
  assert.ok(!types('Open', 'Abierto', 'state').includes('length_overflow'))
  assert.ok(!types('Due', 'Importe adeudado', 'label').includes('length_overflow'))
  assert.ok(!types('Post', 'Correo postal', 'label').includes('length_overflow'))
})

test('a genuinely oversized translation is flagged', () => {
  assert.ok(types('Save changes', 'Guardar todos los cambios pendientes en este formulario ahora mismo', 'action').includes('length_overflow'))
})

test('very short sources skip the length check entirely', () => {
  assert.ok(!types('Due', 'Fecha de vencimiento del ticket', 'label').includes('length_overflow'))
})

// -------------------------------------------------------------- ambiguity

test('ambiguity is detected by grouping the batch on source text', () => {
  const amb = findAmbiguousSources([
    { key: 'ticket.button.open', source: 'Open' },
    { key: 'settings.hours.status_label_open', source: 'Open' },
    { key: 'ticket.button.close', source: 'Close' },
  ])
  assert.deepEqual(amb.get('ticket.button.open'), ['settings.hours.status_label_open'])
  assert.deepEqual(amb.get('settings.hours.status_label_open'), ['ticket.button.open'])
  assert.equal(amb.get('ticket.button.close'), undefined)
})

// ------------------------------------------------------------ consistency

test('the same term translated two ways in the same slot is flagged', () => {
  const out = findConsistencyIssues([
    { key: 'a.button.save', source: 'Save', target: 'Guardar', uiRole: 'action', isAmbiguous: false },
    { key: 'b.button.save', source: 'Save', target: 'Salvar', uiRole: 'action', isAmbiguous: false },
  ])
  assert.equal(out.get('a.button.save')?.[0].type, 'terminology_inconsistency')
  assert.equal(out.get('b.button.save')?.[0].type, 'terminology_inconsistency')
})

test('ambiguity suppresses the consistency check', () => {
  // The false positive this prevents: "Due" as a deadline and "Due" as an amount
  // owed must translate differently, and a naive check would report both as errors.
  const out = findConsistencyIssues([
    { key: 'ticket.field.due', source: 'Due', target: 'Vencimiento', uiRole: 'label', isAmbiguous: true },
    { key: 'invoice.field.amount_due', source: 'Due', target: 'Importe adeudado', uiRole: 'label', isAmbiguous: true },
  ])
  assert.equal(out.size, 0, 'context-ambiguous terms must be allowed to diverge')
})

test('the same term in different UI elements is not compared', () => {
  const out = findConsistencyIssues([
    { key: 'a.button.open', source: 'Open', target: 'Abrir', uiRole: 'action', isAmbiguous: false },
    { key: 'b.status.open', source: 'Open', target: 'Abierto', uiRole: 'state', isAmbiguous: false },
  ])
  assert.equal(out.size, 0)
})

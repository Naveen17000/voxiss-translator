/**
 * The live API path, exercised without a real key.
 *
 * The real SDK is pointed at a local stub of the Messages API via
 * ANTHROPIC_BASE_URL, so this covers the code that only ever runs in live mode:
 * request construction, response parsing, stop_reason handling and error
 * mapping. Everything except the network itself is the production path.
 *
 * This exists because the pipeline has no credentials available to it, and
 * "it works in mock mode" says nothing about the branch that will actually run
 * in production.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

interface Captured {
  path: string
  headers: Record<string, string | string[] | undefined>
  body: any
}

const captured: Captured[] = []
let nextResponse: { status: number; body: unknown } = { status: 200, body: {} }

let server: Server
let baseUrl: string

function okMessage(payloadJson: unknown) {
  return {
    id: 'msg_stub',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-4-8',
    content: [
      // A thinking block deliberately sits first: adaptive thinking is enabled,
      // so anything that indexes content[0] for text would break here.
      { type: 'thinking', thinking: '', signature: 'sig_stub' },
      { type: 'text', text: JSON.stringify(payloadJson) },
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 123, output_tokens: 45 },
  }
}

const TRANSLATION_PAYLOAD = {
  translation: 'Reabrir',
  alternatives_considered: [{ text: 'Abierto', rejected_because: 'state, not an action' }],
  disambiguation_note: 'Button, so an infinitive.',
  confidence: 'high',
  assumptions: [],
}

test.before(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      captured.push({ path: req.url ?? '', headers: req.headers, body: raw ? JSON.parse(raw) : null })
      res.writeHead(nextResponse.status, {
        'content-type': 'application/json',
        'request-id': 'req_stub_0001',
      })
      res.end(JSON.stringify(nextResponse.body))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  process.env.ANTHROPIC_API_KEY = 'sk-ant-stub-key-for-tests'
  process.env.ANTHROPIC_BASE_URL = baseUrl
  // The SDK retries 5xx by default; a fixed retry budget keeps the error tests fast.
  process.env.ANTHROPIC_MAX_RETRIES = '0'
})

test.after(() => server.close())

async function callTranslate() {
  const { translateBatch } = await import('../src/pipeline/translate')
  const { newStats } = await import('../src/pipeline/claude')
  const { loadInputs } = await import('../src/pipeline/run')
  const stats = newStats()
  const result = await translateBatch(
    [{ key: 'ticket.button.open', source: 'Open', comment: 'Reopens a closed ticket' }],
    loadInputs().glossary,
    stats,
    'live',
  )
  return { result, stats }
}

test('a live call produces a parsed result and records usage', async () => {
  captured.length = 0
  nextResponse = { status: 200, body: okMessage(TRANSLATION_PAYLOAD) }

  const { result, stats } = await callTranslate()

  assert.equal(result[0].translation, 'Reabrir')
  assert.equal(result[0].uiRole, 'action')
  assert.equal(result[0].alternativesConsidered[0].text, 'Abierto')
  assert.equal(stats.apiCalls, 1)
  assert.equal(stats.inputTokens, 123)
  assert.equal(stats.outputTokens, 45)
  assert.deepEqual(stats.requestIds, ['req_stub_0001'], 'the request id must be captured for support')
})

test('the request is shaped the way the API expects', async () => {
  const req = captured.at(-1)!
  assert.equal(req.path, '/v1/messages')
  assert.equal(req.body.model, 'claude-opus-4-8')

  // Opus 4.8 removed the sampling parameters: sending any of them is a 400,
  // not a silent no-op. This is the guard against reintroducing them.
  assert.equal(req.body.temperature, undefined, 'temperature must not be sent')
  assert.equal(req.body.top_p, undefined, 'top_p must not be sent')
  assert.equal(req.body.top_k, undefined, 'top_k must not be sent')

  assert.deepEqual(req.body.thinking, { type: 'adaptive' })
  assert.equal(req.body.output_config.effort, 'high')
  assert.equal(req.body.output_config.format.type, 'json_schema')

  // Structured outputs require a closed schema, or the constraint is not enforced.
  const schema = req.body.output_config.format.schema
  assert.equal(schema.additionalProperties, false)
  assert.ok(schema.required.includes('translation'))
  assert.ok(typeof req.body.system === 'string' && req.body.system.length > 0)
  assert.ok(req.body.max_tokens > 0)
})

test('the prompt carries the derived UI element and the developer comment', async () => {
  const prompt = captured.at(-1)!.body.messages[0].content as string
  assert.match(prompt, /ticket\.button\.open/)
  assert.match(prompt, /Reopens a closed ticket/)
  assert.match(prompt, /action/, 'the UI element derived in code must reach the model')
  assert.match(prompt, /infinitive/, 'the required grammatical form must reach the model')
})

test('an ambiguity collision is spelled out in the prompt', async () => {
  captured.length = 0
  nextResponse = { status: 200, body: okMessage(TRANSLATION_PAYLOAD) }
  const { translateBatch } = await import('../src/pipeline/translate')
  const { newStats } = await import('../src/pipeline/claude')
  const { loadInputs } = await import('../src/pipeline/run')

  await translateBatch(loadInputs().strings.slice(0, 2), loadInputs().glossary, newStats(), 'live')

  const prompts = captured.map((c) => c.body.messages[0].content as string)
  assert.ok(
    prompts.some((p) => /AMBIGUITY DETECTED/.test(p)),
    'the collision found in code must be stated to the model',
  )
})

test('a scoring call never asks the model for a number', async () => {
  captured.length = 0
  nextResponse = { status: 200, body: okMessage({ issues: [], reasoning: 'fine' }) }
  const { scoreBatch } = await import('../src/pipeline/score')
  const { newStats } = await import('../src/pipeline/claude')
  const { loadInputs } = await import('../src/pipeline/run')
  const { strings, glossary } = loadInputs()

  await scoreBatch({
    rows: [{ key: 'ticket.button.close', source: 'Close', target: 'Cerrar' }],
    catalogue: strings,
    glossary,
    stats: newStats(),
    mode: 'live',
    mockNamespace: 'part2',
  })

  const req = captured.at(-1)!
  const schema = req.body.output_config.format.schema
  const props = Object.keys(schema.properties.issues.items.properties)
  assert.ok(!props.includes('severity'), 'the model must not supply severity')
  assert.ok(!props.includes('score'), 'the model must not supply a score')
  assert.deepEqual(props.sort(), ['evidence', 'explanation', 'suggestion', 'type'])
  assert.match(req.body.system, /do not assign scores/i)

  // The categories offered are exactly the judgment ones — nothing decidable in code.
  const allowed: string[] = schema.properties.issues.items.properties.type.enum
  assert.deepEqual(allowed.slice().sort(), ['fluency', 'meaning_shift', 'register_mismatch', 'ui_role_mismatch', 'wrong_sense'].sort())
})

test('severity comes from the policy table, not from the model', async () => {
  captured.length = 0
  nextResponse = {
    status: 200,
    body: okMessage({
      issues: [
        // A hostile response: a real category with an invented severity, plus a
        // category outside the allowed set.
        { type: 'fluency', severity: 'critical', explanation: 'x', evidence: 'y', suggestion: 'z' },
        { type: 'not_a_real_category', explanation: 'x', evidence: 'y', suggestion: 'z' },
      ],
      reasoning: 'test',
    }),
  }
  const { scoreBatch } = await import('../src/pipeline/score')
  const { newStats } = await import('../src/pipeline/claude')
  const { loadInputs } = await import('../src/pipeline/run')
  const { strings, glossary } = loadInputs()

  const [row] = await scoreBatch({
    rows: [{ key: 'ticket.button.close', source: 'Close', target: 'Cerrar' }],
    catalogue: strings,
    glossary,
    stats: newStats(),
    mode: 'live',
    mockNamespace: 'part2',
  })

  assert.equal(row.issues.length, 1, 'the unknown category must be dropped, not scored')
  assert.equal(row.issues[0].type, 'fluency')
  assert.equal(row.issues[0].severity, 'minor', 'severity must come from the table, not the response')
  assert.equal(row.score, 90, 'the model claiming "critical" must not cost 40')
})

// ------------------------------------------------------------ failure modes

async function expectFailure(body: unknown, status = 200) {
  nextResponse = { status, body }
  const { PipelineApiError } = await import('../src/pipeline/claude')
  try {
    await callTranslate()
    assert.fail('expected the call to throw')
  } catch (err) {
    assert.ok(err instanceof PipelineApiError, `expected PipelineApiError, got ${err}`)
    return err as InstanceType<typeof PipelineApiError>
  }
}

test('a refusal is surfaced, not parsed', async () => {
  const err = await expectFailure({ ...okMessage({}), stop_reason: 'refusal', content: [] })
  assert.match(err.message, /declined/i)
  assert.equal(err.retryable, false)
})

test('a truncated response is caught instead of being treated as complete', async () => {
  // The quiet failure: max_tokens output still looks like well-formed content.
  const err = await expectFailure({ ...okMessage({ translation: 'Reabr' }), stop_reason: 'max_tokens' })
  assert.match(err.message, /truncated/i)
  assert.equal(err.retryable, true)
})

test('a response with no text block fails loudly', async () => {
  const err = await expectFailure({
    ...okMessage({}),
    content: [{ type: 'thinking', thinking: '', signature: 's' }],
  })
  assert.match(err.message, /no text block/i)
})

test('non-JSON in the text block is reported as such', async () => {
  const err = await expectFailure({
    ...okMessage({}),
    content: [{ type: 'text', text: 'I am afraid I cannot do that.' }],
  })
  assert.match(err.message, /not valid JSON/i)
})

test('an auth failure names the missing key rather than leaking the API error', async () => {
  const err = await expectFailure({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401)
  assert.match(err.message, /ANTHROPIC_API_KEY/)
  assert.equal(err.retryable, false)
})

test('a bad model id is reported as not found and is not retried', async () => {
  const err = await expectFailure({ type: 'error', error: { type: 'not_found_error', message: 'model' } }, 404)
  assert.match(err.message, /not found/i)
  assert.equal(err.retryable, false)
})

test('rate limiting is retryable', async () => {
  const err = await expectFailure({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, 429)
  assert.match(err.message, /rate limit/i)
  assert.equal(err.retryable, true)
})

test('a server error is retryable', async () => {
  const err = await expectFailure({ type: 'error', error: { type: 'api_error', message: 'boom' } }, 500)
  assert.equal(err.retryable, true)
})

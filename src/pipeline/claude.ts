import Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_EFFORT, DEFAULT_MODEL } from './config'

/**
 * Thin wrapper over the Messages API.
 *
 * Two things worth calling out:
 *
 * 1. The key is never a parameter. `new Anthropic()` resolves ANTHROPIC_API_KEY
 *    from the environment, so no key is ever written into source, into a
 *    committed file, or into a log line.
 *
 * 2. Every call uses structured outputs (`output_config.format`), so the model
 *    is constrained to a JSON schema rather than asked politely for JSON and
 *    parsed hopefully. Invalid shapes cannot come back.
 *
 * Note there is no `temperature` here. Opus 4.8 removed the sampling
 * parameters — passing `temperature: 0` returns a 400, it does not quietly do
 * nothing. Reproducibility on this pipeline comes from the fixed prompt, the
 * fixed schema, and the fact that scoring arithmetic happens in code.
 */

export interface CallStats {
  apiCalls: number
  inputTokens: number
  outputTokens: number
  requestIds: string[]
}

export function newStats(): CallStats {
  return { apiCalls: 0, inputTokens: 0, outputTokens: 0, requestIds: [] }
}

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!client) client = new Anthropic()
  return client
}

export class PipelineApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'PipelineApiError'
  }
}

export interface StructuredCallOptions {
  system: string
  user: string
  schema: Record<string, unknown>
  stats: CallStats
  maxTokens?: number
}

export async function callStructured<T>({
  system,
  user,
  schema,
  stats,
  maxTokens = 8000,
}: StructuredCallOptions): Promise<T> {
  const anthropic = getClient()

  let response: Anthropic.Message
  let requestId: string | null | undefined
  try {
    // .withResponse() so the request id comes back alongside the body — it is
    // the one thing Anthropic support needs to trace a bad response, and it is
    // useless if you only think to capture it after something has gone wrong.
    const res = await anthropic.messages
      .create({
        model: DEFAULT_MODEL,
        max_tokens: maxTokens,
        system,
        // Adaptive thinking: the model decides how much reasoning each string
        // needs. "Open" on a button warrants more than "Export".
        thinking: { type: 'adaptive' },
        output_config: {
          effort: DEFAULT_EFFORT,
          format: { type: 'json_schema', schema },
        },
        messages: [{ role: 'user', content: user }],
      })
      .withResponse()
    response = res.data
    requestId = res.request_id
  } catch (err) {
    throw wrapApiError(err)
  }

  stats.apiCalls += 1
  stats.inputTokens += response.usage.input_tokens
  stats.outputTokens += response.usage.output_tokens
  if (requestId) stats.requestIds.push(requestId)

  // Check why generation stopped before trusting the content. A truncated
  // response is still well-formed-looking text; a refusal has no content at all.
  if (response.stop_reason === 'refusal') {
    throw new PipelineApiError('The model declined this request.', false)
  }
  if (response.stop_reason === 'max_tokens') {
    throw new PipelineApiError(
      `Response hit the ${maxTokens}-token ceiling and is truncated. Raise maxTokens.`,
      true,
    )
  }

  // Guarded, unlike the pattern where you index [0] into a filtered list and
  // hope a text block is there. With adaptive thinking on, content also
  // contains thinking blocks, so position is not something to rely on.
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!textBlock) {
    throw new PipelineApiError(
      `Response contained no text block (stop_reason: ${response.stop_reason}, blocks: ${response.content
        .map((b) => b.type)
        .join(', ')}).`,
      true,
    )
  }

  try {
    return JSON.parse(textBlock.text) as T
  } catch {
    throw new PipelineApiError(`Structured output was not valid JSON: ${textBlock.text.slice(0, 200)}`, true)
  }
}

function wrapApiError(err: unknown): PipelineApiError {
  // Typed exceptions, most specific first — not string matching on messages.
  if (err instanceof Anthropic.AuthenticationError) {
    return new PipelineApiError('ANTHROPIC_API_KEY is missing or invalid.', false, err)
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new PipelineApiError(`Model "${DEFAULT_MODEL}" was not found or is not available on this key.`, false, err)
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new PipelineApiError('This key does not have access to the requested model.', false, err)
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new PipelineApiError('Rate limited. The SDK already retried; back off and rerun.', true, err)
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new PipelineApiError('Could not reach the Anthropic API. Check network access.', true, err)
  }
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0
    return new PipelineApiError(`API error ${status}: ${err.message}`, status >= 500, err)
  }
  return new PipelineApiError(`Unexpected error: ${String(err)}`, false, err)
}

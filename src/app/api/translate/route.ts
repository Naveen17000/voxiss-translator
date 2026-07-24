import { NextResponse } from 'next/server'
import { PipelineApiError, newStats } from '@/pipeline/claude'
import { translateBatch } from '@/pipeline/translate'
import { loadInputs, resolveMode } from '@/pipeline/run'

export const runtime = 'nodejs'
export const maxDuration = 60

const LIMITS = { key: 200, source: 500, comment: 800 }

/**
 * This is a public endpoint spending a real API key, so it is deliberately
 * narrow: one string, hard length caps, and a coarse in-memory rate limit.
 *
 * The limiter is per-instance and resets on cold start, so on serverless it
 * slows abuse rather than preventing it. A production deployment would put a
 * shared store behind this — noted in the README rather than pretended away.
 */
const RATE = { windowMs: 60_000, max: 10 }
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE.windowMs)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > RATE.max
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Wait a minute and try again.' }, { status: 429 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const { key, source, comment } = (payload ?? {}) as Record<string, unknown>

  for (const [name, value] of Object.entries({ key, source, comment })) {
    if (typeof value !== 'string' || value.trim() === '') {
      return NextResponse.json({ error: `"${name}" is required.` }, { status: 400 })
    }
    if (value.length > LIMITS[name as keyof typeof LIMITS]) {
      return NextResponse.json(
        { error: `"${name}" is longer than ${LIMITS[name as keyof typeof LIMITS]} characters.` },
        { status: 400 },
      )
    }
  }

  const mode = resolveMode()
  const { glossary } = loadInputs()
  const stats = newStats()

  try {
    const [result] = await translateBatch(
      [{ key: (key as string).trim(), source: (source as string).trim(), comment: (comment as string).trim() }],
      glossary,
      stats,
      mode,
    )
    return NextResponse.json({ ...result, mode })
  } catch (err) {
    if (err instanceof PipelineApiError) {
      // Deliberately no stack, no key, no request internals in the response body.
      return NextResponse.json({ error: err.message }, { status: err.retryable ? 503 : 400 })
    }
    console.error('translate route failed', err)
    return NextResponse.json({ error: 'Translation failed unexpectedly.' }, { status: 500 })
  }
}

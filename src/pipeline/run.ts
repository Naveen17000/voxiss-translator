import { DEFAULT_EFFORT, DEFAULT_MODEL, PROMPT_VERSION, SCORING_POLICY_VERSION } from './config'
import { newStats } from './claude'
import { scoreBatch } from './score'
import { translateBatch } from './translate'
import sourceStrings from '../../data/source-strings.json'
import existingTranslations from '../../data/existing-translations.json'
import glossaryData from '../../data/glossary.json'
import type { ExistingTranslation, Glossary, PipelineRun, SourceString } from './types'

/**
 * Imported rather than read off disk at runtime. The API route runs in a
 * serverless function on Vercel, and Next's build tracing cannot follow a
 * dynamically-constructed `readFileSync(join(process.cwd(), ...))` — the data
 * files would be missing from the bundle and the route would 500 with ENOENT
 * in production while working perfectly on a laptop. A static import is
 * bundled, so it works identically in both places.
 */
export function loadInputs() {
  return {
    strings: sourceStrings.strings as SourceString[],
    translations: existingTranslations.translations as ExistingTranslation[],
    glossary: glossaryData as Glossary,
  }
}

export function resolveMode(): 'live' | 'mock' {
  if (process.env.PIPELINE_MODE === 'mock') return 'mock'
  if (!process.env.ANTHROPIC_API_KEY) return 'mock'
  return 'live'
}

export async function runPipeline(mode = resolveMode()): Promise<PipelineRun> {
  const { strings, translations, glossary } = loadInputs()
  const stats = newStats()
  const startedAt = new Date().toISOString()

  // Part 1 — context-aware translation.
  const translated = await translateBatch(strings, glossary, stats, mode)

  // Part 2 — score the translations that came from the previous process, and
  // in the same pass score Part 1's own output with the identical scheme.
  // A quality gate you are unwilling to point at your own work is not a
  // quality gate, and it doubles as the honest demonstration that the two
  // parts are one pipeline rather than two scripts.
  const [scores, selfCheck] = await Promise.all([
    scoreBatch({ rows: translations, catalogue: strings, glossary, stats, mode, mockNamespace: 'part2' }),
    scoreBatch({
      rows: translated.map((t) => ({ key: t.key, source: t.source, target: t.translation })),
      catalogue: strings,
      glossary,
      stats,
      mode,
      mockNamespace: 'selfcheck',
    }),
  ])

  const flagged = scores.filter((s) => s.issues.length > 0)

  return {
    meta: {
      startedAt,
      finishedAt: new Date().toISOString(),
      mode,
      model: mode === 'mock' ? '(fixtures — no model called)' : DEFAULT_MODEL,
      effort: DEFAULT_EFFORT,
      promptVersion: PROMPT_VERSION,
      scoringPolicyVersion: SCORING_POLICY_VERSION,
      apiCalls: stats.apiCalls,
      usage: { inputTokens: stats.inputTokens, outputTokens: stats.outputTokens },
      requestIds: stats.requestIds,
    },
    translations: translated,
    scores,
    selfCheck,
    summary: {
      translated: translated.length,
      scored: scores.length,
      clean: scores.length - flagged.length,
      flagged: flagged.length,
      needsHuman: scores.filter((s) => s.forcedToHuman).length,
      meanScore: scores.length
        ? Math.round((scores.reduce((a, s) => a + s.score, 0) / scores.length) * 10) / 10
        : 0,
    },
  }
}

/**
 * CLI entry point.
 *
 *   npm run pipeline        # live, needs ANTHROPIC_API_KEY
 *   npm run pipeline:mock   # fixtures, no network
 *
 * Writes reports/baseline.json (consumed by the web report) and
 * reports/baseline.md (readable on its own, e.g. in a PR).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runPipeline, resolveMode } from '../src/pipeline/run'
import { renderMarkdown } from '../src/pipeline/report'
import { PipelineApiError } from '../src/pipeline/claude'

async function main() {
  const mode = resolveMode()

  if (mode === 'mock' && process.env.PIPELINE_MODE !== 'mock') {
    console.warn('! ANTHROPIC_API_KEY is not set — falling back to fixtures. This run will not call Claude.\n')
  }
  console.log(`Running pipeline (${mode})...`)

  const run = await runPipeline(mode)

  const outDir = join(process.cwd(), 'reports')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'baseline.json'), JSON.stringify(run, null, 2) + '\n')
  writeFileSync(join(outDir, 'baseline.md'), renderMarkdown(run))

  const { summary, meta } = run
  console.log('')
  console.log(`  mode           ${meta.mode}${meta.mode === 'mock' ? '  (fixtures — no model called)' : `  ${meta.model}`}`)
  console.log(`  api calls      ${meta.apiCalls}`)
  console.log(`  tokens         ${meta.usage.inputTokens} in / ${meta.usage.outputTokens} out`)
  console.log('')
  console.log(`  translated     ${summary.translated}`)
  console.log(`  scored         ${summary.scored}`)
  console.log(`  clean          ${summary.clean}`)
  console.log(`  flagged        ${summary.flagged}`)
  console.log(`  needs a human  ${summary.needsHuman}`)
  console.log(`  mean score     ${summary.meanScore}`)
  console.log('')
  console.log('  → reports/baseline.json')
  console.log('  → reports/baseline.md')
}

main().catch((err) => {
  if (err instanceof PipelineApiError) {
    console.error(`\nPipeline failed: ${err.message}`)
    if (err.retryable) console.error('This looks retryable — try again.')
    process.exit(1)
  }
  console.error('\nPipeline failed unexpectedly:')
  console.error(err)
  process.exit(1)
})

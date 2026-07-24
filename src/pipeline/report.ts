import { SEVERITY_PENALTY } from './config'
import { explainScore } from './scoring'
import { ROLE_LABEL } from './uiRole'
import type { PipelineRun, ScoreResult } from './types'

/** Plain-text report, for a PR comment or an email — same data as the web view. */
export function renderMarkdown(run: PipelineRun): string {
  const { meta, summary, translations, scores, selfCheck } = run
  const L: string[] = []

  L.push('# Translation & quality report — English → Spanish')
  L.push('')
  if (meta.mode === 'mock') {
    L.push('> **Fixture run.** No model was called. The deterministic checks and the scoring')
    L.push('> arithmetic below are real; the judgment layer is stubbed from committed fixtures.')
    L.push('')
  }
  L.push(`Run ${meta.finishedAt} · ${meta.mode} · model ${meta.model} · effort ${meta.effort}`)
  L.push(`Scoring policy v${meta.scoringPolicyVersion} · prompts v${meta.promptVersion} · ${meta.apiCalls} API calls`)
  L.push('')

  L.push('## Summary')
  L.push('')
  L.push('| | |')
  L.push('|---|---|')
  L.push(`| Strings translated | ${summary.translated} |`)
  L.push(`| Existing translations scored | ${summary.scored} |`)
  L.push(`| Passed clean | ${summary.clean} |`)
  L.push(`| Flagged | ${summary.flagged} |`)
  L.push(`| Routed to a human | ${summary.needsHuman} |`)
  L.push(`| Mean score | ${summary.meanScore} / 100 |`)
  L.push('')

  // --- Part 1 ---
  L.push('## Part 1 — Translations')
  L.push('')
  L.push('| Key | Element | English | Spanish | Confidence |')
  L.push('|---|---|---|---|---|')
  for (const t of translations) {
    L.push(`| \`${t.key}\` | ${ROLE_LABEL[t.uiRole]} | ${t.source} | **${t.translation}** | ${t.confidence} |`)
  }
  L.push('')

  const ambiguous = translations.filter((t) => t.isAmbiguous)
  if (ambiguous.length) {
    L.push('### Ambiguous strings')
    L.push('')
    L.push('Same English word, different answers. These are the ones a translator without product context gets wrong.')
    L.push('')
    const groups = new Map<string, typeof ambiguous>()
    for (const t of ambiguous) {
      const k = t.source.toLowerCase()
      groups.set(k, [...(groups.get(k) ?? []), t])
    }
    for (const [word, members] of groups) {
      L.push(`**"${members[0].source}"** — ${members.length} different meanings in this batch`)
      L.push('')
      for (const m of members) {
        L.push(`- \`${m.key}\` (${ROLE_LABEL[m.uiRole]}) → **${m.translation}**`)
        L.push(`  - ${m.disambiguationNote}`)
        for (const a of m.alternativesConsidered) {
          L.push(`  - Rejected "${a.text}": ${a.rejectedBecause}`)
        }
      }
      L.push('')
      void word
    }
  }

  // --- Part 2 ---
  L.push('## Part 2 — Quality scores for the existing translations')
  L.push('')
  L.push('| Key | English | Spanish | Score | Verdict |')
  L.push('|---|---|---|---|---|')
  for (const s of [...scores].sort((a, b) => a.score - b.score)) {
    L.push(`| \`${s.key}\` | ${s.source} | ${s.target} | **${s.score}** | ${s.action} |`)
  }
  L.push('')

  const flagged = scores.filter((s) => s.issues.length > 0).sort((a, b) => a.score - b.score)
  if (flagged.length) {
    L.push('### Issues found')
    L.push('')
    for (const s of flagged) {
      L.push(`#### \`${s.key}\` — "${s.source}" → "${s.target}" — ${s.score}/100`)
      L.push('')
      if (!s.contextRecovered) L.push('_No developer comment was available for this key._')
      for (const i of s.issues) {
        L.push(
          `- **${i.type.replace(/_/g, ' ')}** (−${SEVERITY_PENALTY[i.severity]}, ${i.source === 'rule' ? 'automated check' : 'Claude'}) — ${i.explanation}`,
        )
        L.push(`  - Evidence: \`${i.evidence}\``)
        if (i.suggestion) L.push(`  - Suggested: **${i.suggestion}**`)
      }
      L.push('')
      L.push(`Score: ${explainScore(s.issues)}`)
      L.push('')
    }
  }

  const clean = scores.filter((s) => s.issues.length === 0)
  if (clean.length) {
    L.push(`### Passed clean (${clean.length})`)
    L.push('')
    L.push(clean.map((s) => `\`${s.key}\` → ${s.target}`).join(' · '))
    L.push('')
  }

  // --- self-check ---
  L.push('## Self-check — Part 2 scoring applied to Part 1 output')
  L.push('')
  L.push('The same scheme, pointed at our own translations.')
  L.push('')
  L.push(summarizeSelfCheck(selfCheck))
  L.push('')

  L.push('## How the score works')
  L.push('')
  L.push('Every string starts at 100. Each issue found subtracts a fixed amount by severity:')
  L.push('')
  L.push('| Severity | Penalty |')
  L.push('|---|---|')
  for (const [sev, pen] of Object.entries(SEVERITY_PENALTY)) L.push(`| ${sev} | −${pen} |`)
  L.push('')
  L.push('Claude never produces a number. It finds issues and puts each into a fixed category;')
  L.push('the severity is looked up from a table in code and the arithmetic happens there. The same')
  L.push('defect therefore costs the same on every string and every run, and any score in this report')
  L.push('can be recomputed by hand from the issues listed above it.')
  L.push('')

  return L.join('\n')
}

function summarizeSelfCheck(selfCheck: ScoreResult[]): string {
  const flagged = selfCheck.filter((s) => s.issues.length > 0)
  if (!flagged.length) {
    return `All ${selfCheck.length} of our own translations passed the same gate at 100/100.`
  }
  return [
    `${flagged.length} of ${selfCheck.length} of our own translations were flagged by our own scoring:`,
    '',
    ...flagged.map((s) => `- \`${s.key}\` → "${s.target}" — ${s.score}/100 — ${s.issues.map((i) => i.type).join(', ')}`),
  ].join('\n')
}

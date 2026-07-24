import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEVERITY_PENALTY, ISSUE_CATALOG } from '@/pipeline/config'
import { explainScore } from '@/pipeline/scoring'
import { ROLE_LABEL } from '@/pipeline/uiRole'
import type { PipelineRun, ScoreResult, TranslationResult } from '@/pipeline/types'
import { TryIt } from './components/TryIt'

function loadRun(): PipelineRun {
  return JSON.parse(readFileSync(join(process.cwd(), 'reports', 'baseline.json'), 'utf8'))
}

function tone(score: number): 'pass' | 'watch' | 'fail' {
  if (score >= 90) return 'pass'
  if (score >= 70) return 'watch'
  return 'fail'
}

export default function Page() {
  const run = loadRun()
  const { meta, summary, translations, scores, selfCheck } = run

  // Group the ambiguous strings by the English word they share. This grouping
  // is the report's spine: it is the failure the previous process actually made.
  const collisions = new Map<string, TranslationResult[]>()
  for (const t of translations) {
    if (!t.isAmbiguous) continue
    const k = t.source.toLowerCase()
    collisions.set(k, [...(collisions.get(k) ?? []), t])
  }

  const ordered = [...scores].sort((a, b) => a.score - b.score)
  const unambiguous = translations.filter((t) => !t.isAmbiguous)

  return (
    <main className="shell">
      <header className="masthead">
        <p className="eyebrow">English → Spanish · product UI strings</p>
        <h1 className="masthead__title">
          Translations that know
          <br />
          where they will appear.
        </h1>
        <p className="masthead__lede">
          Claude translates each string using the context it actually ships in, then a fixed scoring
          policy grades existing translations against the same understanding. Every score below can be
          recomputed by hand.
        </p>

        <div className="runmeta">
          <span className="runmeta__item">
            run <b>{new Date(meta.finishedAt).toISOString().replace('T', ' ').slice(0, 16)}Z</b>
          </span>
          <span className="runmeta__item">
            model <b>{meta.model}</b>
          </span>
          <span className="runmeta__item">
            effort <b>{meta.effort}</b>
          </span>
          <span className="runmeta__item">
            policy <b>v{meta.scoringPolicyVersion}</b>
          </span>
          <span className="runmeta__item">
            api calls <b>{meta.apiCalls}</b>
          </span>
          <span className="runmeta__item">
            mean score <b>{summary.meanScore}</b>
          </span>
        </div>

        {meta.mode === 'mock' && (
          <div className="notice">
            <p>
              <b>Fixture run.</b> No model was called for the results below. The deterministic checks
              and the scoring arithmetic are real; the judgment layer is stubbed from committed
              fixtures. Try it live at the bottom of the page.
            </p>
          </div>
        )}
      </header>

      {/* ---------------- signature: the collisions ---------------- */}
      <section className="band">
        <div className="band__head">
          <p className="eyebrow">Part 1 · the hard cases</p>
          <h2 className="band__title">Same word. Different answers.</h2>
          <p className="band__note">
            {collisions.size} English {collisions.size === 1 ? 'word appears' : 'words appear'} more
            than once in this batch, meaning nothing about the word itself can tell you how to
            translate it. The pipeline detects the collision in code, then asks Claude to resolve each
            one against the key and the developer&rsquo;s comment.
          </p>
        </div>

        {[...collisions.values()].map((members) => (
          <article className="collide" key={members[0].source}>
            <div className="collide__word">
              <span className="collide__en">{members[0].source}</span>
              <span className="collide__tag">
                {members.length} meanings in this batch
              </span>
            </div>

            <div className="collide__branches">
              {members.map((m) => (
                <div className="branch" key={m.key}>
                  <p className="branch__role">{ROLE_LABEL[m.uiRole]}</p>
                  <p className="branch__es">{m.translation}</p>
                  <p className="branch__key">{m.key}</p>
                  <p className="branch__why">{m.disambiguationNote}</p>
                  {m.alternativesConsidered.length > 0 && (
                    <ul className="branch__rejects">
                      {m.alternativesConsidered.map((a) => (
                        <li key={a.text}>
                          <s>{a.text}</s> — {a.rejectedBecause}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      {/* ---------------- the rest of part 1 ---------------- */}
      <section className="band">
        <div className="band__head">
          <p className="eyebrow">Part 1 · the rest</p>
          <h2 className="band__title">The unambiguous {unambiguous.length}</h2>
          <p className="band__note">
            One meaning each. Listed for completeness — the grammatical form still has to match the UI
            element, which is why each one is checked the same way.
          </p>
        </div>

        <div className="ledger">
          {unambiguous.map((t) => (
            <div className="row" key={t.key}>
              <div className="cell">
                <span className="cell__label">English</span>
                <div className="cell__text">{t.source}</div>
                <div className="cell__key">{t.key}</div>
              </div>
              <div className="cell cell--target">
                <span className="cell__label">Spanish</span>
                <div className="cell__text">{t.translation}</div>
                <div className="cell__key">{ROLE_LABEL[t.uiRole]}</div>
              </div>
              <div className="cell cell--verdict">
                <span className="verdict verdict--pass">{t.confidence}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- part 2 ---------------- */}
      <section className="band">
        <div className="band__head">
          <p className="eyebrow">Part 2 · quality scoring</p>
          <h2 className="band__title">
            {summary.flagged} of {summary.scored} existing translations need work
          </h2>
          <p className="band__note">
            Worst first. {summary.clean} passed clean. Every string starts at 100 and loses a fixed
            amount per issue found — open any row to see the issues and the arithmetic.
          </p>
        </div>

        <div className="ledger">
          {ordered.map((s) => (
            <Row key={s.key} score={s} />
          ))}
        </div>
      </section>

      {/* ---------------- try it live ---------------- */}
      <section className="band">
        <div className="band__head">
          <p className="eyebrow">Live</p>
          <h2 className="band__title">Try it on your own string</h2>
          <p className="band__note">
            One real API call. Give it a key, an English string and the kind of comment a developer
            would leave, and it will translate for that context and show what it ruled out.
          </p>
        </div>
        <TryIt />
      </section>

      {/* ---------------- methodology ---------------- */}
      <section className="band">
        <div className="band__head">
          <p className="eyebrow">How this works</p>
          <h2 className="band__title">Why the numbers mean something</h2>
        </div>

        <div className="split">
          <div className="split__pane">
            <h3>Claude never sees a number</h3>
            <p>
              The model&rsquo;s only job is to find defects and put each one into a fixed category. It
              is explicitly told not to grade. Severity is then looked up from a table in code, and the
              score is arithmetic.
            </p>
            <p>
              So the same defect costs the same on every string and every run, changing the standard is
              a one-line diff rather than a prompt rewrite, and a reviewer can check any score by hand.
            </p>
            <dl className="deflist">
              {Object.entries(SEVERITY_PENALTY).map(([sev, pen]) => (
                <div key={sev}>
                  <dt>{sev}</dt>
                  <dd>−{pen}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="split__pane">
            <h3>Code checks what code can check</h3>
            <p>
              Placeholders, markup, glossary terms, whitespace, length and consistency across the batch
              each have exactly one right answer. Asking a model for an opinion on them buys nothing
              and risks a confident wrong one, so they run as plain code and never reach the prompt.
            </p>
            <p>
              Claude is spent on the part that genuinely needs judgment: meaning, grammatical form,
              register and fluency.
            </p>
            <dl className="deflist">
              {Object.entries(ISSUE_CATALOG).map(([type, spec]) => (
                <div key={type}>
                  <dt>{type.replace(/_/g, ' ')}</dt>
                  <dd style={{ color: spec.source === 'rule' ? 'var(--seam)' : 'var(--ink-2)' }}>
                    {spec.source === 'rule' ? 'code' : 'Claude'}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="selfcheck" style={{ marginTop: '1.25rem' }}>
          <p>
            <b>Self-check.</b> The Part 2 scorer is also pointed at Part 1&rsquo;s own output, using the
            identical policy.{' '}
            {selfCheck.every((s) => s.issues.length === 0)
              ? `All ${selfCheck.length} of our translations passed at 100.`
              : `${selfCheck.filter((s) => s.issues.length > 0).length} of ${selfCheck.length} were flagged: ${selfCheck
                  .filter((s) => s.issues.length > 0)
                  .map((s) => `${s.key} (${s.score})`)
                  .join(', ')}.`}{' '}
            A quality gate you will not point at your own work is not a quality gate.
          </p>
        </div>
      </section>

      <footer className="foot">
        <p>
          Built for the Voxiis AI Engineer Round 2 task. Scoring policy v{meta.scoringPolicyVersion},
          prompts v{meta.promptVersion}. Source strings, glossary and the full JSON for this run are in
          the repository; the same report renders to Markdown via <code>npm run pipeline</code>.
        </p>
      </footer>
    </main>
  )
}

function Row({ score: s }: { score: ScoreResult }) {
  const t = tone(s.score)
  return (
    <div className="row">
      <div className="cell">
        <span className="cell__label">English</span>
        <div className="cell__text">{s.source}</div>
        <div className="cell__key">{s.key}</div>
      </div>
      <div className="cell cell--target">
        <span className="cell__label">Spanish (existing)</span>
        <div className="cell__text">{s.target}</div>
        <div className="cell__key">{ROLE_LABEL[s.uiRole]}</div>
      </div>
      <div className="cell cell--verdict">
        <span className={`score score--${t}`}>{s.score}</span>
        <span className={`verdict verdict--${t}`}>{s.band}</span>
      </div>

      {s.issues.length > 0 && (
        <details className="flags">
          <summary>
            {s.issues.length} {s.issues.length === 1 ? 'issue' : 'issues'} — {s.action}
          </summary>
          <div className="flags__body">
            {s.issues.map((i, n) => (
              <div className={`issue issue--${i.severity}`} key={`${i.type}-${n}`}>
                <div className="issue__head">
                  <span className={`issue__type verdict--${i.severity === 'critical' ? 'fail' : i.severity === 'major' ? 'watch' : 'pass'}`}>
                    {ISSUE_CATALOG[i.type].label}
                  </span>
                  <span className={`chip ${i.source === 'rule' ? 'chip--rule' : ''}`}>
                    {i.source === 'rule' ? 'automated check' : 'Claude'}
                  </span>
                  <span className="chip">−{SEVERITY_PENALTY[i.severity]}</span>
                </div>
                <p className="issue__text">{i.explanation}</p>
                <div className="issue__meta">
                  <span>
                    evidence <b>{i.evidence}</b>
                  </span>
                  {i.suggestion && (
                    <span>
                      suggested <b>{i.suggestion}</b>
                    </span>
                  )}
                </div>
              </div>
            ))}
            <p className="arith">{explainScore(s.issues)}</p>
          </div>
        </details>
      )}
    </div>
  )
}

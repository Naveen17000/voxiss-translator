'use client'

import { useState } from 'react'

interface Result {
  translation: string
  uiRole: string
  isAmbiguous: boolean
  disambiguationNote: string
  confidence: string
  alternativesConsidered: { text: string; rejectedBecause: string }[]
  assumptions: string[]
  mode: 'live' | 'mock'
}

const EXAMPLES = [
  { key: 'billing.button.cancel', source: 'Cancel', comment: 'Button that ends the customer’s paid subscription' },
  { key: 'modal.button.cancel', source: 'Cancel', comment: 'Button that dismisses a dialog without saving' },
  { key: 'inbox.label.read', source: 'Read', comment: 'Filter label for messages the user has already opened' },
]

export function TryIt() {
  const [key, setKey] = useState(EXAMPLES[0].key)
  const [source, setSource] = useState(EXAMPLES[0].source)
  const [comment, setComment] = useState(EXAMPLES[0].comment)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, source, comment }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
      setResult(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tryit">
      <form onSubmit={submit}>
        <label className="field">
          <span className="field__label">
            String key
            <span className="field__hint">the pipeline reads the UI element out of this</span>
          </span>
          <input value={key} onChange={(e) => setKey(e.target.value)} required maxLength={200} />
        </label>

        <label className="field">
          <span className="field__label">English</span>
          <input value={source} onChange={(e) => setSource(e.target.value)} required maxLength={500} />
        </label>

        <label className="field">
          <span className="field__label">
            Developer comment
            <span className="field__hint">where this appears and what it does</span>
          </span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} required maxLength={800} />
        </label>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Translating…' : 'Translate'}
          </button>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.key}
              type="button"
              onClick={() => {
                setKey(ex.key)
                setSource(ex.source)
                setComment(ex.comment)
              }}
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                cursor: 'pointer',
                font: 'inherit',
                fontSize: '0.8rem',
                color: 'var(--ink-3)',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
              }}
            >
              {ex.key}
            </button>
          ))}
        </div>
      </form>

      {error && <p className="tryit__err">{error}</p>}

      {result && (
        <div className="tryit__out">
          <p className="eyebrow">
            Spanish · {result.uiRole} · confidence {result.confidence}
            {result.mode === 'mock' && ' · fixture'}
          </p>
          <p className="tryit__es">{result.translation}</p>
          <p style={{ color: 'var(--ink-2)', fontSize: '0.95rem' }}>{result.disambiguationNote}</p>

          {result.alternativesConsidered.length > 0 && (
            <ul className="branch__rejects">
              {result.alternativesConsidered.map((a) => (
                <li key={a.text}>
                  <s>{a.text}</s> — {a.rejectedBecause}
                </li>
              ))}
            </ul>
          )}

          {result.assumptions.length > 0 && (
            <p style={{ color: 'var(--ink-3)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
              Assumed: {result.assumptions.join('; ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

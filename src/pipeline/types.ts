export type UiRole = 'action' | 'state' | 'label' | 'title' | 'message' | 'unknown'

export type Severity = 'critical' | 'major' | 'minor' | 'nit'

/** Who found the issue. This is the core split the whole design rests on. */
export type IssueSource = 'rule' | 'model'

export type IssueType =
  // deterministic — found in code, never sent to the model
  | 'empty_target'
  | 'untranslated'
  | 'placeholder_mismatch'
  | 'tag_mismatch'
  | 'glossary_violation'
  | 'terminology_inconsistency'
  | 'whitespace_mismatch'
  | 'punctuation_mismatch'
  | 'length_overflow'
  // judgment — found by Claude, classified into this closed set
  | 'wrong_sense'
  | 'ui_role_mismatch'
  | 'meaning_shift'
  | 'register_mismatch'
  | 'fluency'

export interface Issue {
  type: IssueType
  severity: Severity
  source: IssueSource
  /** One line a non-technical reviewer can act on. */
  explanation: string
  /** The specific text that triggered it, so a human can check the claim. */
  evidence: string
  suggestion: string | null
}

export interface SourceString {
  key: string
  source: string
  comment: string
}

export interface ExistingTranslation {
  key: string
  source: string
  target: string
}

export interface Glossary {
  locale: string
  mandated: { source: string; target: string; note?: string }[]
  doNotTranslate: string[]
}

/** Part 1 output for one string. */
export interface TranslationResult {
  key: string
  source: string
  comment: string
  uiRole: UiRole
  /** True when this exact source text appears under more than one key in the batch. */
  isAmbiguous: boolean
  ambiguousWith: string[]
  translation: string
  /** What else the model considered, and why it went the other way. */
  alternativesConsidered: { text: string; rejectedBecause: string }[]
  disambiguationNote: string
  confidence: 'high' | 'medium' | 'low'
  assumptions: string[]
}

export type Band = 'approve' | 'review' | 'fix' | 'reject'

/** Part 2 output for one string. */
export interface ScoreResult {
  key: string
  source: string
  target: string
  /** Recovered by joining to the string catalogue; null when the key is unknown. */
  comment: string | null
  contextRecovered: boolean
  uiRole: UiRole
  issues: Issue[]
  score: number
  band: Band
  action: string
  /** True when a critical issue forces human review regardless of the number. */
  forcedToHuman: boolean
}

export interface RunMeta {
  startedAt: string
  finishedAt: string
  /** 'live' means real API calls. 'mock' means committed fixtures, no network. */
  mode: 'live' | 'mock'
  model: string
  effort: string
  promptVersion: string
  scoringPolicyVersion: string
  apiCalls: number
  usage: { inputTokens: number; outputTokens: number }
  requestIds: string[]
}

export interface PipelineRun {
  meta: RunMeta
  translations: TranslationResult[]
  scores: ScoreResult[]
  /** Part 2's scorer applied to Part 1's own output — the pipeline grading itself. */
  selfCheck: ScoreResult[]
  summary: {
    translated: number
    scored: number
    clean: number
    flagged: number
    needsHuman: number
    meanScore: number
  }
}

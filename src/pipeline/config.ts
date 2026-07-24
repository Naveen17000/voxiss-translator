import type { Band, IssueSource, IssueType, Severity, UiRole } from './types'

/**
 * SCORING POLICY
 *
 * This file is the entire quality policy. Claude never emits a number — it
 * detects and classifies issues, and the arithmetic happens here. That means:
 *
 *   - the same issue always costs the same, on every string, on every run
 *   - changing the standard is a diff in this table, not a prompt rewrite
 *   - a reviewer can recompute any score by hand from the issue list
 *
 * Bump SCORING_POLICY_VERSION whenever anything below changes, so old reports
 * stay interpretable.
 */
export const SCORING_POLICY_VERSION = '1.0.0'
export const PROMPT_VERSION = '1.0.0'

export const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 40,
  major: 25,
  minor: 10,
  nit: 3,
}

interface IssueSpec {
  severity: Severity
  source: IssueSource
  label: string
  /** Plain-English description for the reviewer-facing methodology table. */
  meaning: string
}

export const ISSUE_CATALOG: Record<IssueType, IssueSpec> = {
  // ---- deterministic. Code decides these. The model is not consulted. ----
  empty_target: {
    severity: 'critical',
    source: 'rule',
    label: 'Empty translation',
    meaning: 'Nothing was translated.',
  },
  untranslated: {
    severity: 'critical',
    source: 'rule',
    label: 'Left in English',
    meaning: 'The Spanish is identical to the English and the term is not on the do-not-translate list.',
  },
  placeholder_mismatch: {
    severity: 'critical',
    source: 'rule',
    label: 'Placeholder broken',
    meaning: 'A variable like {count} was dropped, added, or renamed. This breaks the running product.',
  },
  tag_mismatch: {
    severity: 'critical',
    source: 'rule',
    label: 'Markup broken',
    meaning: 'HTML tags do not match the source. This breaks rendering.',
  },
  glossary_violation: {
    severity: 'major',
    source: 'rule',
    label: 'Glossary not followed',
    meaning: 'A term the glossary mandates was translated some other way.',
  },
  terminology_inconsistency: {
    severity: 'major',
    source: 'rule',
    label: 'Inconsistent with the rest of the batch',
    meaning: 'The same English string in the same kind of UI slot was translated differently elsewhere.',
  },
  whitespace_mismatch: {
    severity: 'nit',
    source: 'rule',
    label: 'Whitespace differs',
    meaning: 'Leading or trailing spaces do not match the source.',
  },
  punctuation_mismatch: {
    severity: 'nit',
    source: 'rule',
    label: 'Punctuation differs',
    meaning: 'Trailing punctuation does not match the source.',
  },
  length_overflow: {
    severity: 'minor',
    source: 'rule',
    label: 'Too long for the space',
    meaning: 'Much longer than the English, which risks overflowing a button or column.',
  },

  // ---- judgment. Claude detects these; severity is still fixed here. ----
  wrong_sense: {
    severity: 'critical',
    source: 'model',
    label: 'Wrong meaning of an ambiguous word',
    meaning: 'The English word has several meanings and the translation picked the wrong one.',
  },
  ui_role_mismatch: {
    severity: 'major',
    source: 'model',
    label: 'Wrong grammatical form for this UI element',
    meaning: 'A button needs a verb, a status needs a state word, a field label needs a noun. This one does not match.',
  },
  meaning_shift: {
    severity: 'major',
    source: 'model',
    label: 'Says something the English does not',
    meaning: 'Understandable Spanish, but it asserts or implies something different from the source.',
  },
  register_mismatch: {
    severity: 'minor',
    source: 'model',
    label: 'Wrong tone or formality',
    meaning: 'Too formal, too casual, or inconsistent with the rest of the product voice.',
  },
  fluency: {
    severity: 'minor',
    source: 'model',
    label: 'Reads unnaturally',
    meaning: 'A native speaker would phrase this differently.',
  },
}

/** The closed set Claude is allowed to return. Anything else is dropped. */
export const MODEL_ISSUE_TYPES = (Object.keys(ISSUE_CATALOG) as IssueType[]).filter(
  (t) => ISSUE_CATALOG[t].source === 'model',
)

export const BANDS: { band: Band; min: number; action: string; tone: string }[] = [
  { band: 'approve', min: 90, action: 'Ship as is', tone: 'good' },
  { band: 'review', min: 70, action: 'Spot-check before shipping', tone: 'watch' },
  { band: 'fix', min: 50, action: 'Fix before shipping', tone: 'bad' },
  { band: 'reject', min: 0, action: 'Retranslate', tone: 'bad' },
]

export function scoreToBand(score: number): { band: Band; action: string } {
  const hit = BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1]
  return { band: hit.band, action: hit.action }
}

/**
 * How much longer than the source a translation may run before we call it an
 * overflow risk. Buttons sit in fixed-width chrome, so they get the tight
 * budget; full sentences get room. Spanish runs longer than English as a rule,
 * which is why even the tight budget is generous.
 */
export const LENGTH_BUDGET: Record<UiRole, number> = {
  action: 1.6,
  state: 1.8,
  label: 1.8,
  title: 1.8,
  message: 2.5,
  unknown: 2.0,
}

/** Below this many characters, length ratios are noise. */
export const LENGTH_CHECK_MIN_CHARS = 4

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
const EFFORT_LEVELS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export const DEFAULT_MODEL = process.env.PIPELINE_MODEL ?? 'claude-opus-4-8'

/**
 * Validated rather than trusted: an unrecognised PIPELINE_EFFORT would be a 400
 * at request time, which is a slow and confusing way to learn about a typo.
 */
export const DEFAULT_EFFORT: Effort = EFFORT_LEVELS.includes(process.env.PIPELINE_EFFORT as Effort)
  ? (process.env.PIPELINE_EFFORT as Effort)
  : 'high'

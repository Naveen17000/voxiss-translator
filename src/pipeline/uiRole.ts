import type { UiRole } from './types'

/**
 * The key tells you what kind of UI element a string lives in, and that
 * determines which grammatical form Spanish needs. This is pure pattern
 * matching on the key — no model call, same answer every time.
 *
 * It matters because it turns "is this translation right?" (a judgment call)
 * into "is this the form a button needs?" (a checkable one). The role derived
 * here is handed to Claude as a constraint, not left for it to guess.
 */
export function inferUiRole(key: string): UiRole {
  const segments = key.toLowerCase().split(/[.\/]/)
  const has = (...names: string[]) =>
    segments.some((seg) => names.some((n) => seg === n || seg.includes(n)))

  // Order matters. `settings.hours.status_label_open` contains both "status"
  // and "label"; it is a status, and that reading has to win.
  if (has('status', 'state')) return 'state'
  if (has('button', 'btn', 'action', 'cta', 'link')) return 'action'
  if (has('title', 'heading', 'header')) return 'title'
  if (has('error', 'toast', 'message', 'msg', 'tooltip', 'help', 'description', 'hint')) return 'message'
  if (has('label', 'field', 'column', 'placeholder', 'caption')) return 'label'
  return 'unknown'
}

/** What Spanish should look like in that slot. Goes verbatim into the prompt. */
export const ROLE_EXPECTATION: Record<UiRole, string> = {
  action:
    'A clickable control. Spanish UI convention is the bare infinitive — "Guardar", "Cerrar", "Publicar". Never an adjective or a past participle.',
  state:
    'A status readout describing the current condition of something. Spanish wants an adjective or a state noun — "Abierto", "Pendiente", "En curso". Never an infinitive, because nothing is being commanded.',
  label:
    'The name of a field, column, or form input. Spanish wants a noun phrase — "Vencimiento", "Importe adeudado". Never an infinitive.',
  title: 'A heading. Noun phrase, sentence case.',
  message: 'Prose shown to the user. A complete, natural sentence.',
  unknown:
    'The key does not say what kind of element this is. Infer from the developer comment and say so in your assumptions.',
}

export const ROLE_LABEL: Record<UiRole, string> = {
  action: 'Button / action',
  state: 'Status',
  label: 'Field label',
  title: 'Heading',
  message: 'Message',
  unknown: 'Unclassified',
}

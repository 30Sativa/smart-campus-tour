/**
 * Backend vocabulary for the visitor app, translated once.
 *
 * Same rule as `features/operations/status.ts`, same `StatusTone` scale, one
 * difference: the words are English, because the visitor area is an English
 * surface, and the tone is returned as a token name rather than a Tailwind class
 * string. The operations table hard-codes light-theme hex values, which cannot
 * follow the visitor area's light/dark switch — so the colours live in
 * `visitor.css` as `.vs-badge--<tone>` and resolve against the `--lp-*` tokens
 * the landing page already defines for both themes.
 *
 * Tone scale, unchanged from operations:
 *
 *   ok      finished, healthy, arrived
 *   info    scheduled, running normally
 *   warn    paused, needs attention
 *   danger  cancelled, failed
 *   muted   waiting, unknown
 *
 * Colour is never the only carrier: `StatusBadge` always prints the label.
 */
export type StatusTone = 'ok' | 'info' | 'warn' | 'danger' | 'muted'

type Entry = { label: string; tone: StatusTone }

/** Keyed by the enum value lowercased, so casing from the API never matters. */
const STATUS: Record<string, Entry> = {
  // Booking lifecycle
  confirmed: { label: 'Confirmed', tone: 'info' },
  upcoming: { label: 'Upcoming', tone: 'info' },
  inprogress: { label: 'In progress', tone: 'ok' },
  active: { label: 'In progress', tone: 'ok' },
  completed: { label: 'Completed', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  canceled: { label: 'Cancelled', tone: 'danger' },
  pending: { label: 'Waiting for a robot', tone: 'muted' },

  // Robot state, as a visitor should read it. No ROS vocabulary.
  navigating: { label: 'On the way', tone: 'ok' },
  paused: { label: 'Paused', tone: 'warn' },
  arrived: { label: 'Arrived', tone: 'ok' },
  waiting: { label: 'Waiting for you', tone: 'info' },
  returning: { label: 'Heading back', tone: 'info' },
}

/**
 * An unknown value is shown as it came rather than hidden behind "Unknown": a
 * status this table has not learned yet is a gap to notice, not one to paper
 * over. It is toned `muted`, so it never borrows the authority of a finished or
 * a cancelled state.
 */
export function statusInfo(value?: string | null): Entry {
  if (!value) return { label: 'Not set', tone: 'muted' }
  return STATUS[value.trim().toLowerCase()] ?? { label: value, tone: 'muted' }
}

export function statusLabel(value?: string | null): string {
  return statusInfo(value).label
}

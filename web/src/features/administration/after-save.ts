/**
 * Navigation state for the move a successful save makes. The save's own `navigate` runs before React
 * re-renders with the saved draft, so `when` would still be true; this marks that move as safe.
 */
export const AFTER_SAVE = { state: { afterSave: true } } as const

export const isAfterSave = (state: unknown) => typeof state === 'object' && state !== null && 'afterSave' in state

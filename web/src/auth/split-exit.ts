/**
 * After a successful sign-in the glass card lifts away and dissolves while the
 * aurora behind it fades, and the destination page is already underneath.
 * Built on the native View Transitions API (styles in auth.css, "Sign-in
 * exit"); where the API is missing or the user prefers reduced motion, the
 * navigation simply happens without it.
 *
 * The attribute on <html> is what gives the card and the aurora their
 * transition names, so the exit only runs for this navigation.
 */
const SPLIT_MS = 1200

export function prepareSplitExit(): boolean {
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') return false
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  const root = document.documentElement
  root.dataset.authExit = 'split'
  window.setTimeout(() => {
    delete root.dataset.authExit
  }, SPLIT_MS)
  return true
}

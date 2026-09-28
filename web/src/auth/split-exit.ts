/**
 * After a successful sign-in the auth screen splits in two: the form column
 * slides out to the left, the photograph to the right, and the destination
 * page is already underneath. Built on the native View Transitions API
 * (styles in auth.css, "Sign-in exit"); where the API is missing or the user
 * prefers reduced motion, the navigation simply happens without it.
 *
 * The attribute on <html> is what gives the two halves their transition
 * names, so the split only runs for this navigation and never for the
 * sign-in / sign-up switch.
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

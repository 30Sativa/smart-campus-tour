/**
 * The exit after a successful sign-in: the auth screen splits down the middle,
 * the two halves slide apart, and the destination is already there behind them.
 *
 * How: the auth root is cloned twice into a fixed overlay, each copy clipped to
 * one half of the viewport. Navigation happens underneath straight away, so the
 * new area mounts (and its lazy chunk loads) while the curtain still covers it;
 * then the halves are pushed off-screen and the overlay removes itself.
 *
 * Purely decorative: the clones are `aria-hidden`, `inert` and carry no ids.
 * Nothing waits on the animation. Without an auth root (tests, a future page
 * that reuses the form) or with reduced motion, it just navigates.
 */

const OPEN_DELAY_MS = 380
const DURATION_MS = 1050

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function half(root: HTMLElement, side: 'left' | 'right') {
  const wrap = document.createElement('div')
  wrap.className = `ah-split__half ah-split__half--${side}`
  const clone = root.cloneNode(true) as HTMLElement
  clone.removeAttribute('id')
  clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'))
  clone.setAttribute('data-entrance', 'off')
  clone.classList.add('ah-split__clone')
  const rect = root.getBoundingClientRect()
  Object.assign(clone.style, {
    position: 'absolute',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    minHeight: `${rect.height}px`,
    margin: '0',
  })
  wrap.appendChild(clone)
  return wrap
}

export function playSplitExit(root: Element | null, go: () => void): void {
  if (!(root instanceof HTMLElement) || typeof document === 'undefined' || prefersReducedMotion()) {
    go()
    return
  }

  const overlay = document.createElement('div')
  overlay.className = 'ah-split'
  overlay.setAttribute('aria-hidden', 'true')
  overlay.inert = true
  overlay.append(half(root, 'left'), half(root, 'right'))
  const seam = document.createElement('div')
  seam.className = 'ah-split__seam'
  overlay.appendChild(seam)
  document.body.appendChild(overlay)

  go()

  // Two frames so the overlay is painted closed before it opens.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      window.setTimeout(() => overlay.classList.add('is-open'), OPEN_DELAY_MS)
    }),
  )
  window.setTimeout(() => overlay.remove(), OPEN_DELAY_MS + DURATION_MS + 200)
}

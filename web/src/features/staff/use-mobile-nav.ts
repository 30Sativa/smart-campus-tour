import { useEffect, useRef } from 'react'

/**
 * The keyboard half of the shells' mobile navigation drawer.
 *
 * Both shells render the same drawer: an off-canvas panel over a scrim, opened
 * by a floating button. Visually it worked; by keyboard it did not. Opening it
 * left focus on the button behind the scrim, Escape did nothing, and closing it
 * dropped focus on `<body>`, so the next Tab restarted at the top of the page.
 *
 * Returns the ref to put on the panel. It is one hook rather than a copy in each
 * shell because the two drawers must not drift: a fix here is a fix in both.
 *
 * Deliberately not a focus trap. The panel is a sibling of the page, not a
 * modal, and the shells do not mark it `aria-modal`; trapping focus in something
 * that is not announced as modal is worse than leaving it escapable.
 */
export function useMobileNav(open: boolean, close: () => void) {
  const panelRef = useRef<HTMLElement>(null)
  const openerRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return

    openerRef.current = document.activeElement
    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      const opener = openerRef.current
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus()
    }
  }, [open, close])

  return panelRef
}

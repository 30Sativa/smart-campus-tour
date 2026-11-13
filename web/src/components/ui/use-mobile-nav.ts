import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The keyboard half of the shells' mobile navigation drawer.
 *
 * Both shells render the same drawer: an off-canvas panel over a scrim, opened
 * by the menu button at the top left of the header. Visually it worked; by keyboard it did not. Opening it
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

/**
 * The whole drawer state a console shell needs: open/close, the panel ref, and
 * focus that moves to the drawer's close button on open and back to the header's
 * menu button on close. One hook, so the four shells cannot drift apart.
 */
export function useConsoleDrawer() {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const openDrawer = useCallback(() => setOpen(true), [])
  const panelRef = useMobileNav(open, close)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const menuButton = menuButtonRef.current
    closeButtonRef.current?.focus()
    return () => menuButton?.focus()
  }, [open])
  return { open, openDrawer, close, panelRef, menuButtonRef, closeButtonRef }
}

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/** Mounted once per pathname; query-string filters never reset the page. */
export function VisitorRoute({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    window.scrollTo({ top: 0, behavior: 'instant' })
    let focusedHeading: HTMLHeadingElement | null = null
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const revealed = new WeakSet<Element>()
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.remove('vs-reveal-pending')
        observer?.unobserve(entry.target)
      }
    }, { threshold: 0.08 })
    const discover = () => {
      const heading = root.querySelector('h1')
      if (heading && heading !== focusedHeading) {
        heading.tabIndex = -1
        heading.focus({ preventScroll: true })
        document.title = `${heading.textContent} · CampusTour`
        focusedHeading = heading
      }
      if (!motion.matches && observer) for (const section of root.querySelectorAll('[data-visitor-reveal]')) {
        if (revealed.has(section)) continue
        revealed.add(section)
        // Above-the-fold content stays visible; only later sections reveal.
        if (section.getBoundingClientRect().top > window.innerHeight) {
          section.classList.add('vs-reveal-pending')
          observer.observe(section)
        }
      }
    }
    const disableMotion = () => {
      if (motion.matches) root.querySelectorAll('.vs-reveal-pending').forEach((node) => node.classList.remove('vs-reveal-pending'))
    }
    discover()
    const mutations = new MutationObserver(discover)
    mutations.observe(root, { childList: true, subtree: true })
    motion.addEventListener('change', disableMotion)
    return () => { observer?.disconnect(); mutations.disconnect(); motion.removeEventListener('change', disableMotion) }
  }, [])
  return <div ref={ref} className="vs-route">{children}</div>
}

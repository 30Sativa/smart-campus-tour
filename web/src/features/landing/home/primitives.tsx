import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'

/**
 * Small building blocks shared by the home sections. None of them animates by
 * itself: they only render the markup and data attributes that
 * `useHomeMotion` looks for, so the page reads correctly with motion off and in
 * tests.
 */

type SplitTextProps = {
  as?: 'h1' | 'h2' | 'h3' | 'p'
  /** One string, or one string per forced line. */
  text: string | string[]
  className?: string
  id?: string
  /** Animate on mount instead of on scroll (the hero). */
  auto?: boolean
}

/**
 * Headline whose characters rise one by one. Screen readers get the plain
 * sentence; the per-character spans are hidden from them.
 */
export function SplitText({ as: Tag = 'h2', text, className, id, auto }: SplitTextProps) {
  const lines = Array.isArray(text) ? text : [text]
  let index = 0

  return (
    <Tag className={className} id={id} data-split="" data-auto={auto ? '' : undefined}>
      <span className="hm-sr">{lines.join(' ')}</span>
      <span aria-hidden="true">
        {lines.map((line, li) => (
          <span key={li} className={lines.length > 1 ? 'hm-row' : undefined}>
            {line.normalize('NFC').split(/\s+/).filter(Boolean).map((word, wi, words) => (
              <span key={wi}>
                <span className="hm-w">
                  {Array.from(word).map((ch, ci) => (
                    <span key={ci} className="hm-c" style={{ '--i': Math.min(index++, 90) } as CSSProperties}>
                      {ch}
                    </span>
                  ))}
                </span>
                {wi < words.length - 1 ? ' ' : null}
              </span>
            ))}
          </span>
        ))}
      </span>
    </Tag>
  )
}

/** Paragraph that lights up word by word as the section scrolls past. */
export function RevealWords({ text, accent, className, id }: { text: string; accent?: string; className?: string; id?: string }) {
  const words = text.split(/\s+/).filter(Boolean)
  return (
    <p className={className} id={id} data-words="">
      {accent && (
        <>
          <span className="hm-rw hm-accent">{accent}</span>{' '}
        </>
      )}
      {words.map((word, i) => (
        <span key={i}>
          <span className="hm-rw">{word}</span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </p>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 13 13 3M5 3h8v8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 8h12M9 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2v12M2 8h12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

type PillProps = {
  to: string
  children: ReactNode
  variant?: 'light' | 'dark'
  className?: string
  onClick?: () => void
}

/** Pill button: on hover a second arrow slides in from the left. */
export function PillLink({ to, children, variant = 'light', className, onClick }: PillProps) {
  const cls = ['hm-btn', variant === 'dark' ? 'hm-btn--dark' : '', className ?? ''].filter(Boolean).join(' ')
  const inner = (
    <>
      <span className="hm-btn__ic hm-btn__ic--l" aria-hidden="true"><ArrowIcon /></span>
      <span className="hm-btn__t">{children}</span>
      <span className="hm-btn__ic hm-btn__ic--r" aria-hidden="true"><ArrowIcon /></span>
    </>
  )
  return to.startsWith('#') ? (
    <a href={to} className={cls} onClick={onClick}>{inner}</a>
  ) : (
    <Link to={to} className={cls} onClick={onClick}>{inner}</Link>
  )
}

/** Text link with the ring-and-dot marker. */
export function DotLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="hm-dotlink" href={href}>
      <span className="hm-dotlink__u">{children}</span>
      <span className="hm-dotlink__box" aria-hidden="true"><span className="hm-dotlink__dot" /></span>
    </a>
  )
}

/**
 * A number that counts up once visible. It renders the final value, so the
 * figure is right with motion off; the motion layer resets and animates it.
 */
export function CountUp({ value, prefix = '', pad = 0 }: { value: number; prefix?: string; pad?: number }) {
  return (
    <span data-count={value} data-prefix={prefix} data-pad={pad || undefined}>
      {prefix + String(value).padStart(pad, '0')}
    </span>
  )
}

/** Kicker label with the lime dot. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={['hm-mono hm-kicker', className ?? ''].join(' ')}>{children}</div>
}

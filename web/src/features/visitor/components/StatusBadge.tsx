import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
import { statusInfo } from '../visitor-status'

/**
 * A status, in plain English, with its tone.
 *
 * Same contract as the operations badge: the label is always printed, so colour
 * is never the only carrier, and the two tones that mean "something changed"
 * also carry an icon. The colours come from the `--vs-*` tone tokens in
 * visitor.css, which follow the light/dark switch.
 */
export function StatusBadge({ value, className = '' }: { value?: string | null; className?: string }) {
  const { label, tone } = statusInfo(value)
  const Icon = tone === 'danger' ? CircleAlert : tone === 'warn' ? TriangleAlert : tone === 'ok' ? CircleCheck : null
  return (
    <span className={`vs-badge vs-badge--${tone} ${className}`.trim()}>
      {Icon && <Icon size={12} strokeWidth={2.2} aria-hidden="true" />}
      {label}
    </span>
  )
}

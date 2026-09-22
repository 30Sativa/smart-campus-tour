/**
 * Class-name recipes shared by the staff screens. Kept out of `StaffUi.tsx`
 * so that file exports components only (fast refresh).
 */

/**
 * Button hierarchy: primary is the one thing the screen wants next (white on
 * #2563eb is ~5.2:1, AA), secondary is everything else, danger ends or
 * overrides something and always sits behind a confirmation.
 */
export type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost'

const BUTTON_KIND: Record<ButtonKind, string> = {
  primary:
    'bg-[#2563eb] text-white shadow-xs hover:bg-[#1d4ed8] active:scale-[0.98] disabled:bg-[#93c5fd] disabled:shadow-none',
  secondary:
    'border border-[#e2e8f0] bg-white text-[#0f172a] hover:bg-[#f8fafc] hover:border-[#cbd5e1] active:scale-[0.98] disabled:text-[#94a3b8] disabled:hover:bg-white',
  danger:
    'border border-[#fecaca] bg-[#fef2f2] text-[#dc2626] hover:bg-[#fee2e2] active:scale-[0.98] disabled:opacity-50',
  ghost: 'text-[#2563eb] hover:bg-[#eff6ff] active:scale-[0.98] disabled:text-[#94a3b8]',
}

export function buttonClass(kind: ButtonKind = 'secondary', size: 'sm' | 'md' | 'lg' = 'md') {
  const sizing =
    size === 'sm'
      ? 'min-h-9 px-3 text-[13px]'
      : size === 'lg'
      ? 'min-h-11 px-5 text-[15px]'
      : 'min-h-10 px-4 text-sm'
  return `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 ${sizing} ${BUTTON_KIND[kind]}`
}

/** Flat panel with a soft lift on hover, for cards the operator clicks into. */
export const cardClass =
  'rounded-2xl border border-[#e2e8f0] bg-white shadow-xs transition-all duration-200 hover:border-[#cbd5e1] hover:shadow-sm'

/* ── Form controls and tables, shared by both consoles ───────────────────── */

/** Text input, select and textarea. `aria-invalid` turns it red; no separate error variant. */
export const inputClass =
  'w-full rounded-xl border border-[#e2e8f0] bg-white px-3 py-2.5 text-sm text-[#0f172a] shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#94a3b8] hover:border-[#cbd5e1] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15 disabled:bg-[#f8fafc] disabled:text-[#94a3b8] aria-[invalid=true]:border-[#dc2626] aria-[invalid=true]:ring-[#dc2626]/15'

export const labelClass = 'block text-[13px] font-medium text-[#334155]'

/** Table header cell: sentence case and quiet; the rows carry the weight. */
export const thClass = 'px-4 py-3 text-xs font-medium whitespace-nowrap text-[#64748b]'
export const tdClass = 'px-4 py-3.5 align-middle'
/** Row: a hover tint so a long row can be followed across the screen. */
export const rowClass = 'transition-colors duration-150 hover:bg-[#f8fafc]'

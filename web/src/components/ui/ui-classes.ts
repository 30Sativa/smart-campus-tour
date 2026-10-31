export type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost'

const BUTTON_KIND: Record<ButtonKind, string> = {
  primary:
    'bg-[#2d719e] text-white shadow-xs hover:bg-[#245e84] active:scale-[0.98] disabled:bg-[#e3edf4] disabled:text-[#8fa8bb] disabled:shadow-none',
  secondary:
    'border border-[#d9e9f5] bg-white text-[#285c7d] hover:bg-[#f1f8fe] hover:border-[#a8cde6] active:scale-[0.98] disabled:text-[#94a3b8] disabled:hover:bg-white',
  danger:
    'border border-[#f5c8c2] bg-[#fff1ef] text-[#b23e31] hover:bg-[#fde4e0] active:scale-[0.98] disabled:opacity-50',
  ghost: 'text-[#2d78a9] hover:bg-[#e9f5ff] active:scale-[0.98] disabled:text-[#94a3b8]',
}



export function buttonClass(kind: ButtonKind = 'secondary', size: 'sm' | 'md' | 'lg' = 'md') {
  const sizing =
    size === 'sm'
      ? 'min-h-8 gap-1.5 rounded-lg px-3 text-[13px]'
      : size === 'lg'
      ? 'min-h-10 gap-2 rounded-[10px] px-4 text-sm'
      : 'min-h-10 gap-2 rounded-xl px-4 text-sm'
  return `inline-flex items-center justify-center whitespace-nowrap font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2 ${sizing} ${BUTTON_KIND[kind]}`
}



/* ── Form controls and tables, shared by both consoles ───────────────────── */

/** Text input, select and textarea. `aria-invalid` turns it red; no separate error variant. */
export const inputClass =
  'w-full min-h-10 rounded-xl border border-[#d9e9f5] bg-white px-3 py-2 text-sm text-[#0f172a] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#64748b] hover:border-[#a8cde6] focus:border-[#5b9dc9] focus:ring-2 focus:ring-[#5b9dc9]/15 disabled:bg-[#f4f9fd] disabled:text-[#94a3b8] aria-[invalid=true]:border-[#dc2626] aria-[invalid=true]:ring-[#dc2626]/15'



export const labelClass = 'block text-xs font-medium text-[#334155]'



/** Table header cell: sentence case and quiet; the rows carry the weight. */
export const thClass = 'bg-[#f8fafc] px-4 py-3 text-xs font-semibold whitespace-nowrap text-[#475569]'


export const tdClass = 'px-4 py-3 text-sm align-middle'


/** Row: a hover tint so a long row can be followed across the screen. */
export const rowClass = 'transition-colors duration-150 hover:bg-[#fafcfe]'



/* ── Light surfaces: an off-white page with white cards lifted by a soft shadow ── */

/** White card on the off-white page; two soft shadows give depth without a hard border. */
export const cardClass =
  'rounded-2xl border border-[#e2e8f0] bg-white shadow-xs'

/** A quieter tile inside a card: one reading (telemetry value, note). */
export const tileClass = 'rounded-xl border border-[#edf2f7] bg-[#f8fafc]'

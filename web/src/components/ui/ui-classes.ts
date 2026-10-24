export type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost'

const BUTTON_KIND: Record<ButtonKind, string> = {
  primary:
    'bg-[#2d719e] text-white shadow-xs hover:bg-[#245e84] active:scale-[0.98] disabled:bg-[#e3edf4] disabled:text-[#8fa8bb] disabled:shadow-none',
  secondary:
    'border border-[#d9e9f5] bg-white text-[#285c7d] hover:bg-[#f1f8fe] hover:border-[#a8cde6] active:scale-[0.98] disabled:text-[#94a3b8] disabled:hover:bg-white',
  danger:
    'border border-[#fecaca] bg-[#fef2f2] text-[#dc2626] hover:bg-[#fee2e2] active:scale-[0.98] disabled:opacity-50',
  ghost: 'text-[#2d78a9] hover:bg-[#e9f5ff] active:scale-[0.98] disabled:text-[#94a3b8]',
}



export function buttonClass(kind: ButtonKind = 'secondary', size: 'sm' | 'md' | 'lg' = 'md') {
  const sizing =
    size === 'sm'
      ? 'min-h-9 px-3 text-[13px]'
      : size === 'lg'
      ? 'min-h-11 px-5 text-[15px]'
      : 'min-h-10 px-4 text-sm'
  return `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2 ${sizing} ${BUTTON_KIND[kind]}`
}



/* ── Form controls and tables, shared by both consoles ───────────────────── */

/** Text input, select and textarea. `aria-invalid` turns it red; no separate error variant. */
export const inputClass =
  'w-full rounded-xl border border-[#d9e9f5] bg-white px-3 py-2.5 text-sm text-[#173b59] shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#94a8b8] hover:border-[#a8cde6] focus:border-[#5b9dc9] focus:ring-2 focus:ring-[#5b9dc9]/15 disabled:bg-[#f4f9fd] disabled:text-[#94a3b8] aria-[invalid=true]:border-[#dc2626] aria-[invalid=true]:ring-[#dc2626]/15'



export const labelClass = 'block text-[13px] font-medium text-[#334155]'



/** Table header cell: sentence case and quiet; the rows carry the weight. */
export const thClass = 'px-4 py-3 text-xs font-medium whitespace-nowrap text-[#64748b]'


export const tdClass = 'px-4 py-3.5 align-middle'


/** Row: a hover tint so a long row can be followed across the screen. */
export const rowClass = 'transition-colors duration-150 hover:bg-[#f8fafc]'

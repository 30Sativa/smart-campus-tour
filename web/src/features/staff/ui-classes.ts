/**
 * Class-name recipes shared by the staff screens. Kept out of `StaffUi.tsx`
 * so that file exports components only (fast refresh).
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
      ? 'min-h-8.5 px-3 text-xs'
      : size === 'lg'
      ? 'min-h-11 px-5 text-sm'
      : 'min-h-9.5 px-3.5 text-xs'
  return `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-bold transition-all duration-150 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 ${sizing} ${BUTTON_KIND[kind]}`
}

/** Flat panel with a soft lift on hover, for cards the operator clicks into. */
export const cardClass =
  'rounded-2xl border border-[#e2e8f0] bg-white shadow-xs transition-all duration-200 hover:border-[#cbd5e1] hover:shadow-sm'



export type StatusTone = 'ok' | 'info' | 'warn' | 'danger' | 'muted'

/** Neutral presentation classes for the shared status tone scale. Business
 * labels and mappings stay with their owning feature. */
/** Solid dot per tone; the one place a tone becomes a fill colour. */
export const dotClass: Record<StatusTone, string> = {
  ok: 'bg-[#2f8f6b]',
  info: 'bg-[#5b91ed]',
  warn: 'bg-[#d69412]',
  danger: 'bg-[#c9534a]',
  muted: 'bg-[#a8b6c9]',
}



export const toneClass: Record<StatusTone, string> = {
  ok: 'border-[#cde9dc] bg-[#effbf5] text-[#1f7a55]',
  info: 'border-[#cfe1fb] bg-[#eef5ff] text-[#2f62b8]',
  warn: 'border-[#f0d89f] bg-[#fff8e6] text-[#8a5a06]',
  danger: 'border-[#f5c8c2] bg-[#fff1ef] text-[#b23e31]',
  muted: 'border-[#dbe6f4] bg-[#f6f9fd] text-[#5d7085]',
}

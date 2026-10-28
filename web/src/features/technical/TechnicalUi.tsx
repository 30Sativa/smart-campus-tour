import type { ReactNode } from 'react'
import { toneClass, type StatusTone } from '../../components/ui/status-tone'

export function TechnicalPage({ children }: { children: ReactNode }) {
  return <div className="min-h-full bg-[#f6f7f9] px-4 py-6 sm:px-6 lg:px-9 lg:py-8"><div className="mx-auto w-full max-w-[1360px]">{children}</div></div>
}

export function ToneBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${toneClass[tone]}`}>{children}</span>
}

import type { ReactNode } from 'react'
import { AlertCircle, CircleAlert, LoaderCircle, TriangleAlert } from 'lucide-react'
import { ApiError } from '../../api/client'
import { statusInfo, toneClass } from './status'

export const panelClass = 'overflow-hidden rounded-2xl border border-[#dce9fb] bg-white shadow-[0_10px_30px_rgba(69,112,167,0.07)]'

/**
 * The page's own heading. The shell header names the area, so this must not
 * repeat it: eyebrow, title and supporting line each say something new.
 */
export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p className="text-[11px] font-bold tracking-[0.12em] text-[#5b91ed] uppercase">{eyebrow}</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-[-0.03em] text-[#1f314d] sm:text-[28px]">{title}</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#71819a]">{description}</p>
      </div>
      {action}
    </header>
  )
}

export function LoadingPanel({ label = 'Đang tải dữ liệu vận hành…' }: { label?: string }) {
  return <div className={`${panelClass} flex min-h-60 items-center justify-center gap-3 p-8 text-sm font-semibold text-[#647793]`} aria-busy="true"><LoaderCircle className="animate-spin text-[#5b91ed]" size={20} />{label}</div>
}

export function ErrorPanel({ error }: { error: unknown }) {
  const detail = error instanceof ApiError && error.status === 403 ? 'Tài khoản hiện tại không có quyền xem dữ liệu này.' : error instanceof ApiError && error.status === 401 ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' : 'Không tải được dữ liệu vận hành. Kiểm tra kết nối với máy chủ rồi thử lại.'
  return <div className={`${panelClass} flex min-h-60 flex-col items-center justify-center gap-3 p-8 text-center text-[#647793]`} role="alert"><AlertCircle className="text-[#bd473a]" size={24} /><p className="font-bold text-[#40546f]">{detail}</p></div>
}

export function EmptyPanel({ children }: { children: ReactNode }) {
  return <div className={`${panelClass} flex min-h-44 items-center justify-center p-8 text-center text-sm font-medium text-[#71819a]`}>{children}</div>
}

/**
 * A status, in Vietnamese, with its tone.
 *
 * The two tones that mean "act now" also carry an icon, so the badge never
 * relies on colour alone to say a robot is down or an alert is critical.
 */
export function StatusBadge({ value, className = '' }: { value?: string | null; className?: string }) {
  const { label, tone } = statusInfo(value)
  const Icon = tone === 'danger' ? CircleAlert : tone === 'warn' ? TriangleAlert : null
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${toneClass[tone]} ${className}`}>
      {Icon && <Icon size={12} aria-hidden="true" />}
      {label}
    </span>
  )
}

/** Fallback while a lazy area page chunk loads. */
export function PageSkeleton() {
  return (
    <div className="flex flex-1 items-start justify-center bg-[#f1f6fe] p-8" aria-busy="true" aria-label="Đang tải trang">
      <div className="w-full max-w-[1500px] space-y-5">
        <div className="h-16 max-w-md animate-pulse rounded-2xl bg-[#e2ecfb]" />
        <div className="h-24 animate-pulse rounded-2xl bg-[#e2ecfb]" />
        <div className="h-80 animate-pulse rounded-2xl bg-[#e2ecfb]" />
      </div>
    </div>
  )
}

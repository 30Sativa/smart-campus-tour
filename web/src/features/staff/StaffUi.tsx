import type { ReactNode } from 'react'
import { AlertCircle, CircleAlert, RotateCcw, TriangleAlert } from 'lucide-react'
import { ApiError } from '../../api/client'
import { dotClass, toneClass, type StatusTone } from '../../components/ui/status-tone'
import { statusInfo } from './status'
import { panelClass } from '../../components/ui/ConsolePrimitives'

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const status = error instanceof ApiError ? error.status : undefined
  const detail =
    status === 403
      ? 'Tài khoản hiện tại không có quyền xem dữ liệu này.'
      : status === 401
      ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
      : 'Không tải được dữ liệu vận hành. Kiểm tra kết nối với máy chủ rồi thử lại.'
  const canRetry = Boolean(onRetry) && status !== 401 && status !== 403
  return (
    <div
      className={`${panelClass} flex min-h-60 flex-col items-center justify-center gap-3 p-8 text-center text-[#64748b]`}
      role="alert"
    >
      <div className="grid size-11 place-items-center rounded-2xl bg-[#fef2f2] text-[#ef4444]">
        <AlertCircle size={22} />
      </div>
      <p className="font-bold text-[#0f172a] text-sm max-w-md">{detail}</p>
      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white px-4 text-xs font-bold text-[#2563eb] shadow-xs hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2"
        >
          <RotateCcw size={14} aria-hidden="true" />
          Thử lại
        </button>
      )}
    </div>
  )
}

export function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className={`${panelClass} flex min-h-44 items-center justify-center p-8 text-center text-sm font-medium text-[#64748b]`}>
      {children}
    </div>
  )
}

export function StaffPage({
  children,
  wide = false,
  className = '',
}: {
  children: ReactNode
  wide?: boolean
  className?: string
}) {
  return (
    <div className={`min-h-full bg-[#f8fbff] px-4 py-6 sm:px-6 lg:px-9 lg:py-8 ${className}`}>
      <div
        className={`mx-auto w-full transition-[opacity,translate] duration-300 ease-out starting:translate-y-1.5 starting:opacity-0 motion-reduce:transition-none ${
          wide ? 'max-w-[1600px]' : 'max-w-[1440px]'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

export function LiveDot({ tone = 'ok', pulse = true }: { tone?: StatusTone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex size-2 shrink-0" aria-hidden="true">
      {pulse && tone !== 'danger' && (
        <span
          className={`absolute inline-flex size-full animate-ping rounded-full opacity-40 [animation-duration:2.4s] motion-reduce:hidden ${dotClass[tone]}`}
        />
      )}
      <span className={`relative inline-flex size-2 rounded-full ${dotClass[tone]}`} />
    </span>
  )
}

export function StatusBadge({
  value,
  className = '',
  size = 'sm',
  live = false,
}: {
  value?: string | null
  className?: string
  size?: 'sm' | 'md'
  live?: boolean
}) {
  const { label, tone } = statusInfo(value)
  const Icon = tone === 'danger' ? CircleAlert : tone === 'warn' ? TriangleAlert : null
  const md = size === 'md'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold whitespace-nowrap transition-colors duration-200 ${
        md ? 'px-3 py-1 text-[13px]' : 'px-2.5 py-0.5 text-[11px]'
      } ${toneClass[tone]} ${className}`}
    >
      {Icon ? <Icon size={md ? 14 : 12} aria-hidden="true" /> : live ? <LiveDot tone={tone} /> : null}
      {label}
    </span>
  )
}

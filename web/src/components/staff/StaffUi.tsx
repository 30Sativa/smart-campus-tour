import type { ReactNode } from 'react'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import { ApiError } from '../../api/client'

export const panelClass = 'overflow-hidden rounded-2xl border border-[#dce9fb] bg-white shadow-[0_10px_30px_rgba(69,112,167,0.07)]'

export function PageHeader({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <header className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="mb-1 flex items-center gap-2 text-xs font-bold text-[#5b91ed]">{icon} Điều hành tour</div><h2 className="text-2xl font-bold tracking-[-0.04em] text-[#1f314d] sm:text-[28px]">{title}</h2><p className="mt-1 max-w-3xl text-sm text-[#71819a]">{description}</p></div>{action}</header>
}

export function LoadingPanel({ label = 'Đang tải dữ liệu vận hành…' }: { label?: string }) {
  return <div className={`${panelClass} flex min-h-60 items-center justify-center gap-3 p-8 text-sm font-semibold text-[#647793]`} aria-busy="true"><LoaderCircle className="animate-spin text-[#5b91ed]" size={20} />{label}</div>
}

export function ErrorPanel({ error }: { error: unknown }) {
  const detail = error instanceof ApiError && error.status === 403 ? 'Tài khoản hiện tại không có quyền xem dữ liệu này.' : error instanceof ApiError && error.status === 401 ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' : 'Không tải được dữ liệu vận hành. Kiểm tra kết nối với máy chủ rồi thử lại.'
  return <div className={`${panelClass} flex min-h-60 flex-col items-center justify-center gap-3 p-8 text-center text-[#647793]`} role="alert"><AlertCircle className="text-[#d85c4b]" size={24} /><p className="font-bold text-[#40546f]">{detail}</p></div>
}

export function EmptyPanel({ children }: { children: ReactNode }) {
  return <div className={`${panelClass} flex min-h-44 items-center justify-center p-8 text-center text-sm font-medium text-[#71819a]`}>{children}</div>
}

export function StatusPill({ value }: { value?: string | null }) {
  const text = value || 'Chưa xác định'
  const valueLower = text.toLowerCase()
  const tone = valueLower.includes('critical') || valueLower.includes('emergency') || valueLower.includes('fault') || valueLower.includes('error') || valueLower.includes('disconnected') || valueLower.includes('cancel') ? 'border-[#f5c8c2] bg-[#fff1ef] text-[#c95042]' : valueLower.includes('warning') || valueLower.includes('stale') || valueLower.includes('paused') || valueLower.includes('recall') ? 'border-[#f5dfb2] bg-[#fff9e9] text-[#a96d0b]' : valueLower.includes('active') || valueLower.includes('navigating') || valueLower.includes('live') || valueLower.includes('completed') || valueLower.includes('idle') ? 'border-[#cde9dc] bg-[#effbf5] text-[#25895f]' : 'border-[#dbe6f4] bg-[#f6f9fd] text-[#647793]'
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${tone}`}>{text}</span>
}

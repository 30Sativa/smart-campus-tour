import { labels } from './remote-status'
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { PageHeader as VisitorPageHeader } from '../visitor/components/PageHeader'
import './remote-ui.css'
import { panelClass, PageHeader } from '../staff/StaffUi'
import { RemotePreviewError } from '../../mocks/remote-tour-mock'

export const buttonClass = 'remote-button inline-flex min-h-11 items-center justify-center rounded-xl border border-[#dce9fb] bg-white px-4 py-2 text-sm font-semibold text-[#2f62b8] hover:bg-[#eaf4ff] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#4f8df7]'
export const inputClass = 'remote-input min-h-11 w-full rounded-xl border border-[#dce9fb] bg-white px-3 py-2 text-sm text-[#1f314d] focus:outline-2 focus:outline-[#4f8df7]'

export function Badge({ value }: { value: string }) { return <span className="remote-badge inline-flex rounded-full bg-[#eaf4ff] px-3 py-1 text-xs font-bold text-[#2f62b8]">{labels[value] ?? 'Chưa xác định'}</span> }
export function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className={`remote-panel ${panelClass}`}><h2 className="remote-panel-title border-b border-[#edf2fa] px-5 py-4 font-bold text-[#40546f]">{title}</h2><div className="p-5">{children}</div></section> }
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="remote-field grid gap-2 text-sm font-semibold text-[#40546f]">{label}{children}</label> }
export function PreviewNotice() { return <p className="mb-5 rounded-xl border border-[#dce9fb] bg-[#eaf4ff] p-3 text-sm text-[#40546f]">Bản xem trước với dữ liệu mẫu. Chưa kết nối robot, email, video hoặc AI thật. Dữ liệu nhập chỉ giữ trong bộ nhớ và mất khi tải lại trang.</p> }
export function RemotePage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const { pathname } = useLocation()
  const visitor = pathname.startsWith('/visit') || pathname.startsWith('/join')
  if (visitor) return <div className="vs-page vs-stack remote-visitor" lang="vi"><VisitorPageHeader eyebrow="Campus tour" title={title} description={description} />{children}</div>
  return <div className="min-h-full bg-[#f4f6fa] px-4 py-5 sm:px-6 lg:px-8 lg:py-7"><div className="mx-auto w-full max-w-[1500px] space-y-5"><PageHeader eyebrow="Tham quan từ xa" title={title} description={description} />{children}</div></div>
}
export function MutationError({ error }: { error: unknown }) { return error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error instanceof RemotePreviewError ? error.message : 'Không thể thực hiện. Kiểm tra thông tin rồi thử lại.'}</p> : null }
export function Confirmation({ title, open, pending, error, children, onConfirm, onClose }: { title: string; open: boolean; pending: boolean; error?: unknown; children: ReactNode; onConfirm: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => { const dialog = ref.current; if (open && !dialog?.open) dialog?.showModal(); if (!open && dialog?.open) dialog.close() }, [open])
  return <dialog ref={ref} aria-labelledby={id} onCancel={e => { e.preventDefault(); if (!pending) onClose() }} className="remote-dialog m-auto w-[min(92vw,32rem)] rounded-2xl border border-[#dce9fb] bg-white p-6 text-[#40546f] shadow-xl backdrop:bg-slate-900/30"><h2 id={id} className="mb-4 text-xl font-bold">{title}</h2><div className="space-y-4">{children}<MutationError error={error} /></div><div className="mt-6 flex justify-end gap-3"><button autoFocus className={buttonClass} disabled={pending} onClick={onClose}>Quay lại</button><button className={buttonClass} disabled={pending} onClick={onConfirm}>{pending ? 'Đang xử lý…' : 'Xác nhận'}</button></div></dialog>
}

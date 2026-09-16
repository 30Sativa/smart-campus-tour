import { useState } from 'react'
import { BellRing, Check, Filter } from 'lucide-react'
import { ApiError } from '../../api/client'
import { useAcknowledgeAlert, useStaffAlerts } from '../../api/staff-hooks'
import { ErrorPanel, LoadingPanel, PageHeader, panelClass, StatusPill } from '../../components/staff/StaffUi'
import { formatDateTime } from '../../components/staff/StaffFormatters'

const severities = ['', 'Information', 'Warning', 'Critical']

export default function StaffAlertsPage() {
  const [mode, setMode] = useState<'open' | 'acknowledged' | 'all'>('open')
  const [severity, setSeverity] = useState('')
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const acknowledged = mode === 'all' ? undefined : mode === 'acknowledged'
  const alerts = useStaffAlerts(acknowledged, severity || undefined)
  const acknowledge = useAcknowledgeAlert()
  const submit = async (id: string) => {
    try { setMessage(''); await acknowledge.mutateAsync({ id, resolutionNote: note }); setNoteFor(null); setNote(''); setMessage('Đã xác nhận cảnh báo. Bản ghi vẫn được lưu trong lịch sử.') } catch (e) { setMessage(e instanceof ApiError ? e.body : 'Không thể xác nhận cảnh báo.') }
  }
  return <div className="min-h-full bg-[#f1f6fe] px-4 py-5 sm:px-6 lg:px-8 lg:py-7"><div className="mx-auto w-full max-w-[1500px]">
    <PageHeader icon={<BellRing size={14} />} title="Cảnh báo vận hành" description="Xác nhận không xóa cảnh báo. Thông tin người xác nhận, thời điểm và ghi chú được giữ lại trong lịch sử vận hành." />
    <section className={panelClass}><div className="flex flex-col gap-3 border-b border-[#edf2fa] p-4 md:flex-row md:items-center md:justify-between"><div className="flex gap-2">{([['open', 'Chưa xác nhận'], ['acknowledged', 'Đã xác nhận'], ['all', 'Tất cả']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setMode(key)} className={`rounded-full px-3 py-2 text-xs font-bold ${mode === key ? 'bg-[#eaf4ff] text-[#3a6fd8]' : 'text-[#71819a] hover:bg-[#f6f9fd]'}`}>{label}</button>)}</div><label className="flex items-center gap-2 text-xs font-bold text-[#647793]"><Filter size={14} />Mức độ<select value={severity} onChange={(event) => setSeverity(event.target.value)} className="rounded-lg border border-[#dce9fb] bg-white px-2 py-1.5 text-xs outline-none">{severities.map((item) => <option key={item} value={item}>{item || 'Tất cả'}</option>)}</select></label></div>
      {message && <p className={`mx-5 mt-5 rounded-xl px-4 py-3 text-sm font-semibold ${message.startsWith('Đã') ? 'border border-[#cde9dc] bg-[#effbf5] text-[#25895f]' : 'border border-[#f5c8c2] bg-[#fff1ef] text-[#c95042]'}`}>{message}</p>}
      {alerts.isPending ? <div className="p-5"><LoadingPanel /></div> : alerts.isError ? <div className="p-5"><ErrorPanel error={alerts.error} /></div> : alerts.data.length === 0 ? <p className="p-12 text-center text-sm font-medium text-[#71819a]">Không có cảnh báo phù hợp.</p> : <div className="divide-y divide-[#edf2fa]">{alerts.data.map((alert) => <article key={alert.id} className="p-5"><div className="flex flex-col justify-between gap-4 md:flex-row"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusPill value={alert.severity} /><span className="text-xs font-bold text-[#71819a]">{alert.type}</span></div><p className="mt-3 text-sm font-semibold text-[#40546f]">{alert.message}</p><p className="mt-2 text-xs text-[#8a98ac]">{alert.amrName || 'Hệ thống'} · {formatDateTime(alert.createdAt)}{alert.tourSessionId ? ` · Phiên ${alert.tourSessionId.slice(0, 8)}` : ''}</p>{alert.acknowledgedAt && <p className="mt-2 text-xs text-[#25895f]">Đã xác nhận bởi {alert.acknowledgedBy || 'nhân viên'} lúc {formatDateTime(alert.acknowledgedAt)}{alert.resolutionNote ? ` · ${alert.resolutionNote}` : ''}</p>}</div>{!alert.acknowledgedAt && <button type="button" onClick={() => { setNoteFor(alert.id); setNote('') }} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#cde9dc] bg-[#effbf5] px-4 text-sm font-bold text-[#25895f] hover:bg-[#dbf5e8]"><Check size={16} />Xác nhận</button>}</div>{noteFor === alert.id && <div className="mt-4 rounded-xl border border-[#dce9fb] bg-[#f8fbff] p-4"><label className="grid gap-2 text-xs font-bold text-[#516783]">Ghi chú xử lý (tùy chọn)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={2} className="rounded-xl border border-[#dce9fb] bg-white px-3 py-2 text-sm font-normal text-[#40546f] outline-none focus:border-[#6ba0ff]" /></label><div className="mt-3 flex gap-2"><button type="button" onClick={() => submit(alert.id)} disabled={acknowledge.isPending} className="min-h-9 rounded-lg bg-[#25895f] px-3 text-xs font-bold text-white disabled:opacity-60">{acknowledge.isPending ? 'Đang lưu…' : 'Xác nhận cảnh báo'}</button><button type="button" onClick={() => setNoteFor(null)} className="min-h-9 rounded-lg border border-[#dce9fb] bg-white px-3 text-xs font-bold text-[#647793]">Hủy</button></div></div>}</article>)}</div>}
    </section>
  </div></div>
}

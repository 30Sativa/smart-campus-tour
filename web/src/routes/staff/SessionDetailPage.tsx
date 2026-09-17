import { useState } from 'react'
import { Bot, History, Radio } from 'lucide-react'
import { useParams } from 'react-router'
import { ApiError } from '../../api/client'
import type { Assignment, MissionCommand } from '../../api/contracts/operations'
import { useAssignAmr, useMissionCommand, useReassignAmr, useOpsAmrs, useTourSession } from '../../features/operations/operations-hooks'
import { ErrorPanel, LoadingPanel, PageHeader, panelClass, StatusBadge } from '../../features/operations/OperationsUi'
import { formatBattery, formatDateTime, formatTime } from '../../features/operations/formatters'

function AssignmentPanel({ sessionId, sessionStatus, assignments }: { sessionId: string; sessionStatus: string; assignments: Assignment[] }) {
  const amrs = useOpsAmrs()
  const assign = useAssignAmr()
  const reassign = useReassignAmr()
  const [selected, setSelected] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const isScheduled = sessionStatus === 'Scheduled'
  const hasActive = assignments.some((item) => item.status === 'Active')
  const available = amrs.data || []

  const handleAssign = async () => {
    try {
      setError('')
      if (!selected) { setError('Hãy chọn AMR để gán.'); return }
      await assign.mutateAsync({ sessionId, amrUnitId: selected, reason })
    } catch (e) { setError(e instanceof ApiError ? e.body : 'Không thể gán AMR.') }
  }

  const handleReassign = async () => {
    try {
      setError('')
      if (!selected) { setError('Hãy chọn AMR mới để gán lại.'); return }
      if (!reason.trim()) { setError('Gán lại AMR bắt buộc phải có lý do.'); return }
      await reassign.mutateAsync({ sessionId, amrUnitId: selected, reason })
    } catch (e) { setError(e instanceof ApiError ? e.body : 'Không thể gán lại AMR.') }
  }

  if (!isScheduled) return <p className="rounded-xl border border-[#dbe6f4] bg-[#f6f9fd] px-4 py-3 text-xs leading-5 text-[#647793]">Chỉ phiên tour chưa bắt đầu mới được gán hoặc gán lại AMR. Phiên hiện tại: <strong>{sessionStatus}</strong>.</p>
  return <div className="space-y-4"><div className="space-y-2">{assignments.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl border border-[#edf2fa] px-4 py-3 text-sm"><div><p className="font-bold text-[#40546f]">{item.amrName}</p><p className="text-xs text-[#8a98ac]">Bởi {item.assignedBy || 'hệ thống'} · {formatDateTime(item.assignedAt)}</p></div><StatusBadge value={item.status} /></div>)}</div>
    {error && <p className="rounded-xl border border-[#f5c8c2] bg-[#fff1ef] px-3 py-2 text-xs font-semibold text-[#c95042]">{error}</p>}
    <div className="grid gap-3 md:grid-cols-[1fr_auto]"><div className="grid gap-2"><label className="text-xs font-bold text-[#516783]">AMR có sẵn</label><select value={selected} onChange={(event) => setSelected(event.target.value)} className="min-h-11 rounded-xl border border-[#dce9fb] bg-white px-3 text-sm text-[#40546f] outline-none focus:border-[#6ba0ff]"><option value="">Chọn AMR…</option>{available.map((amr) => <option key={amr.id} value={amr.id}>{amr.name} · {amr.connectionState} · {formatBattery(amr.batteryPercent)} · {amr.operationalState}</option>)}</select><p className="text-[11px] text-[#8a98ac]">AMR phải ở trạng thái Idle, Live, pin ít nhất 20% và chưa bận phiên khác.</p></div><div className="grid gap-2"><label className="text-xs font-bold text-[#516783]">Lý do {hasActive ? '(bắt buộc khi gán lại)' : '(tùy chọn)'}</label><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder={hasActive ? 'Nhập lý do gán lại…' : 'Lý do gán AMR…'} className="min-h-11 rounded-xl border border-[#dce9fb] bg-white px-3 text-sm text-[#40546f] outline-none focus:border-[#6ba0ff]" /></div></div>
    <div className="grid gap-2 sm:grid-cols-2">{hasActive ? <button type="button" onClick={handleReassign} disabled={reassign.isPending} className="min-h-11 rounded-xl bg-[#1f314d] px-4 text-sm font-bold text-white hover:bg-[#2f4768] disabled:opacity-60">{reassign.isPending ? 'Đang gán lại…' : 'Gán lại AMR'}</button> : <button type="button" onClick={handleAssign} disabled={assign.isPending} className="min-h-11 rounded-xl bg-[#5b91ed] px-4 text-sm font-bold text-white hover:bg-[#407bd8] disabled:opacity-60">{assign.isPending ? 'Đang gán…' : 'Gán AMR'}</button>}<span className="rounded-xl border border-[#dbe6f4] bg-[#f6f9fd] px-3 py-3 text-xs leading-4 text-[#71819a]">Mọi thao tác gán đều được lưu lịch sử và kiểm tra trạng thái.</span></div>
  </div>
}

function MissionPanel({ sessionId, mission, sessionStatus }: { sessionId: string; mission?: { id: string; state: string; progressPercent: number } | null; sessionStatus: string }) {
  const command = useMissionCommand()
  const [pending, setPending] = useState<MissionCommand | null>(null)
  const [confirm, setConfirm] = useState<MissionCommand | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const execute = async (action: MissionCommand) => {
    try { setPending(action); setHint(''); await command.mutateAsync({ sessionId, command: action, reason }); setConfirm(null); setReason(''); setError(''); setHint('Đã gửi lệnh vận hành và ghi lại hành trình.') } catch (e) { setError(e instanceof ApiError ? e.body : 'Không thể gửi lệnh nhiệm vụ.') } finally { setPending(null) }
  }
  if (!mission) return <p className="rounded-xl border border-[#dbe6f4] bg-[#f6f9fd] px-4 py-3 text-xs leading-5 text-[#647793]">Phiên tour chưa có mission nào. Hãy gán AMR khi phiên tour vẫn ở trạng thái chưa bắt đầu.</p>
  const state = mission.state
  const canPause = state === 'Navigating'
  const canResume = state === 'Paused'
  const canRecall = state === 'Navigating' || state === 'Paused'
  const canCancel = state !== 'Completed' && state !== 'Cancelled'
  return <div className="space-y-4"><div className="rounded-xl border border-[#edf2fa] px-4 py-3"><div className="flex items-center justify-between gap-3"><StatusBadge value={state} /><span className="text-xs text-[#8a98ac]">Tiến độ {mission.progressPercent ?? 0}% · Phiên {sessionStatus}</span></div>{hint && <p className="mt-3 rounded-lg border border-[#cde9dc] bg-[#effbf5] px-3 py-2 text-xs font-semibold text-[#25895f]">{hint}</p>}{error && <p className="mt-3 rounded-lg border border-[#f5c8c2] bg-[#fff1ef] px-3 py-2 text-xs font-semibold text-[#c95042]">{error}</p>}</div>
    <div className="grid gap-2 sm:grid-cols-2"><button type="button" disabled={!canPause || pending !== null} onClick={() => setConfirm('pause')} className="min-h-10 rounded-xl border border-[#dce9fb] bg-white px-3 text-sm font-bold text-[#40546f] hover:bg-[#f6f9fd] disabled:opacity-50">Tạm dừng</button><button type="button" disabled={!canResume || pending !== null} onClick={() => setConfirm('resume')} className="min-h-10 rounded-xl border border-[#dce9fb] bg-white px-3 text-sm font-bold text-[#40546f] hover:bg-[#f6f9fd] disabled:opacity-50">Tiếp tục</button><button type="button" disabled={!canRecall || pending !== null} onClick={() => setConfirm('recall')} className="min-h-10 rounded-xl bg-[#fff9e9] px-3 text-sm font-bold text-[#8a5f03] hover:bg-[#fff3c7] disabled:opacity-50">Gọi AMR về</button><button type="button" disabled={!canCancel || pending !== null} onClick={() => setConfirm('cancel')} className="min-h-10 rounded-xl border border-[#f5c8c2] bg-[#fff1ef] px-3 text-sm font-bold text-[#c95042] hover:bg-[#ffe5e0] disabled:opacity-50">Hủy mission</button></div>
    {/* No browser E-Stop (web/AGENTS.md §7): a web cancel is an operational request, not a safety stop. */}
    <p className="rounded-xl border border-[#dbe6f4] bg-[#f6f9fd] px-4 py-3 text-xs leading-5 text-[#647793]">Hủy mission từ trình duyệt là yêu cầu vận hành, <strong>không phải ngắt khẩn cấp</strong>. Dừng khẩn cấp chỉ được thực hiện bằng nút E-Stop vật lý trên robot.</p>
    {confirm && <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#1f314d]/30 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-2xl border border-[#dce9fb] bg-white p-5 shadow-[0_18px_60px_rgba(31,49,77,0.22)]"><h4 className="text-base font-bold text-[#1f314d]">Xác nhận lệnh {confirm}</h4><p className="mt-1 text-sm leading-6 text-[#71819a]">Thao tác này sẽ được kiểm tra trạng thái ở máy chủ và ghi vào nhật ký kiểm toán.</p><label className="mt-4 grid gap-2 text-xs font-bold text-[#516783]">Lý do / ghi chú<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={3} placeholder="Lý do thao tác…" className="rounded-xl border border-[#dce9fb] px-3 py-2 text-sm font-normal text-[#40546f] outline-none focus:border-[#6ba0ff]" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => { setConfirm(null); setReason('') }} className="min-h-10 rounded-xl border border-[#dce9fb] bg-white px-4 text-sm font-bold text-[#647793]">Hủy</button><button type="button" onClick={() => execute(confirm)} disabled={pending !== null} className="min-h-10 rounded-xl bg-[#1f314d] px-4 text-sm font-bold text-white hover:bg-[#2f4768] disabled:opacity-60">{pending ? 'Đang gửi…' : 'Xác nhận'}</button></div></div></div>}
  </div>
}

export default function SessionDetailPage() {
  const { sessionId } = useParams()
  const detail = useTourSession(sessionId || '')
  if (detail.isPending) return <div className="min-h-full bg-[#f1f6fe] p-5 lg:p-8"><LoadingPanel /></div>
  if (detail.isError) return <div className="min-h-full bg-[#f1f6fe] p-5 lg:p-8"><ErrorPanel error={detail.error} /></div>
  if (!detail.data) return <div className="min-h-full bg-[#f1f6fe] p-5 lg:p-8"><ErrorPanel error={new ApiError(404, 'Không tìm thấy phiên tour.')} /></div>
  const session = detail.data
  return <div className="min-h-full bg-[#f1f6fe] px-4 py-5 sm:px-6 lg:px-8 lg:py-7"><div className="mx-auto w-full max-w-[1500px]">
    <PageHeader eyebrow="Vận hành tour" title={session.routeName} description={`Phiên ${session.id.slice(0, 8)} · ${formatDateTime(session.startTime)} đến ${formatTime(session.endTime)} · Booking ${session.bookingId.slice(0, 8)}`} />
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <div className="space-y-5">
        <section className={panelClass}><div className="border-b border-[#edf2fa] px-5 py-4"><h3 className="font-bold text-[#40546f]">Thông tin phiên tour</h3></div><div className="grid gap-3 p-5 text-sm"><div className="flex items-center justify-between"><span className="text-[#71819a]">Trạng thái phiên</span><StatusBadge value={session.status} /></div><div className="flex items-center justify-between"><span className="text-[#71819a]">Khách tham quan</span><span className="font-semibold text-[#40546f]">{session.visitorName}</span></div><div className="flex items-center justify-between"><span className="text-[#71819a]">AMR hiện tại</span><span className="font-semibold text-[#40546f]">{session.amrName || 'Chưa gán'}</span></div><div className="flex items-center justify-between"><span className="text-[#71819a]">Mission</span><StatusBadge value={session.mission?.state || 'Không có'} /></div></div></section>
        <section className={panelClass}><div className="border-b border-[#edf2fa] px-5 py-4 flex items-center gap-2 text-[#40546f]"><Bot size={16} /><h3 className="font-bold">Điều phối AMR</h3></div><div className="p-5"><AssignmentPanel sessionId={session.id} sessionStatus={session.status} assignments={session.assignments} /></div></section>
        <section className={panelClass}><div className="border-b border-[#edf2fa] px-5 py-4 flex items-center gap-2 text-[#40546f]"><Radio size={16} /><h3 className="font-bold">Điều khiển mission</h3></div><div className="p-5"><MissionPanel sessionId={session.id} mission={session.mission} sessionStatus={session.status} /></div></section>
      </div>
      <div className="space-y-5">
        <section className={panelClass}><div className="border-b border-[#edf2fa] px-5 py-4 flex items-center gap-2 text-[#40546f]"><History size={16} /><h3 className="font-bold">Dòng thời gian</h3></div><div className="divide-y divide-[#edf2fa]">{session.timeline.length === 0 ? <p className="p-5 text-sm font-medium text-[#8a98ac]">Chưa có sự kiện nào.</p> : session.timeline.map((event) => <div key={event.id} className="px-5 py-4"><p className="text-sm font-semibold text-[#40546f]">{event.type}</p><p className="mt-1 text-xs leading-5 text-[#71819a]">{event.detail || 'Không có ghi chú.'}</p><p className="mt-2 text-xs text-[#9aa8bd]">{formatDateTime(event.occurredAt)}</p></div>)}</div></section>
        <section className={panelClass}><div className="border-b border-[#edf2fa] px-5 py-4"><h3 className="font-bold text-[#40546f]">Cảnh báo liên quan</h3></div><div className="divide-y divide-[#edf2fa]">{session.alerts.length === 0 ? <p className="p-5 text-sm font-medium text-[#8a98ac]">Không có cảnh báo cho phiên này.</p> : session.alerts.map((alert) => <div key={alert.id} className="px-5 py-4"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-[#40546f]">{alert.message}</p><StatusBadge value={alert.severity} /></div><p className="mt-2 text-xs text-[#8a98ac]">{formatDateTime(alert.createdAt)} · {alert.acknowledgedAt ? 'Đã xác nhận' : 'Chưa xác nhận'}</p></div>)}</div></section>
      </div>
    </section>
  </div></div>
}

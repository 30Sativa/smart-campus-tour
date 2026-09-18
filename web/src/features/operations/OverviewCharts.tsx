import { ArrowUpRight, Clock3 } from 'lucide-react'
import { Link } from 'react-router'
import type { OpsDashboard } from '../../api/contracts/operations'
import { panelClass, StatusBadge } from './OperationsUi'
import { statusLabel } from './status'

/** These are current readings, not a fabricated time series. */
export function OverviewCharts({ dashboard, updatedAt }: { dashboard: OpsDashboard; updatedAt: number }) {
  const tourCounts = [
    { label: 'Sắp tới', value: dashboard.upcomingTours },
    { label: 'Đang chạy', value: dashboard.activeTours },
    { label: 'Hoàn thành', value: dashboard.completedTours },
    { label: 'Chờ gán', value: dashboard.pendingTours },
  ]
  const maxTours = Math.max(1, ...tourCounts.map(({ value }) => value))
  const updatedLabel = updatedAt ? `Cập nhật lúc ${new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(updatedAt)}` : 'Đang chờ cập nhật'

  return (
    <section aria-label="Biểu đồ vận hành" className="my-7 grid gap-6 xl:grid-cols-3">
      <article className={panelClass}>
        <div className="m-4 mb-0 rounded-lg bg-[#f8fbff] px-4 pt-5 pb-3">
          <dl className="grid h-44 grid-cols-4 gap-3 border-b border-[#dce9fb] bg-[repeating-linear-gradient(to_top,transparent_0,transparent_35px,#edf2fa_35px,#edf2fa_36px)]">
            {tourCounts.map(({ label, value }) => <div key={label} className="flex min-w-0 flex-col justify-end text-center">
              <dt className="sr-only">{label}</dt><dd className="flex h-full flex-col justify-end"><span className="mb-2 text-xs font-semibold text-[#2f62b8]">{value}</span><span aria-hidden="true" style={{ height: `${value / maxTours * 78}%` }} className="mx-auto block w-full max-w-9 shrink-0 rounded-t bg-gradient-to-t from-[#407bd8] to-[#5b91ed]" /></dd>
            </div>)}
          </dl>
          <div aria-hidden="true" className="mt-3 grid grid-cols-4 gap-2 text-center text-[10px] text-[#647793]">{tourCounts.map(({ label }) => <span key={label}>{label}</span>)}</div>
        </div>
        <div className="px-5 pt-5 pb-4"><h2 className="text-sm font-semibold text-[#1f314d]">Hoạt động tour</h2><p className="mt-1 text-xs leading-5 text-[#71819a]">Số phiên theo từng nhóm trong ngày.</p></div>
        <div className="flex items-center gap-2 border-t border-[#edf2fa] px-5 py-3 text-[11px] text-[#71819a]"><Clock3 size={13} aria-hidden="true" />{updatedLabel}</div>
      </article>

      <article className={panelClass}>
        <div className="m-4 mb-0 min-h-[227px] rounded-lg bg-[#f8fbff] p-4">
          {dashboard.activeAmrsList.length === 0 ? <p className="py-16 text-center text-xs text-[#647793]">Chưa có số liệu AMR.</p> : <ul className="max-h-52 space-y-4 overflow-y-auto pr-1">
            {dashboard.activeAmrsList.map((amr) => <li key={amr.id}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]"><span className="font-medium text-[#2f62b8]">{amr.name}</span><span className="font-semibold text-[#2f62b8]">{amr.batteryPercent == null ? 'Chưa có số liệu' : `${amr.batteryPercent}%`}</span></div>
              {amr.batteryPercent != null && <div className="h-1.5 overflow-hidden rounded-full bg-[#dce9fb]" role="meter" aria-label={`Pin ${amr.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={amr.batteryPercent}><div className={`h-full rounded-full ${amr.connectionState !== 'Live' ? 'bg-[#a96d0b]' : amr.batteryPercent < 20 ? 'bg-[#c95042]' : 'bg-[#25895f]'}`} style={{ width: `${Math.max(0, Math.min(100, amr.batteryPercent))}%` }} /></div>}
              {amr.connectionState !== 'Live' && <p className="mt-1 text-[10px] text-[#8a5a06]">{statusLabel(amr.connectionState)} · {amr.batteryPercent == null ? 'chưa có số liệu mới' : 'số liệu lần cuối'}</p>}
            </li>)}
          </ul>}
        </div>
        <div className="px-5 pt-5 pb-4"><h2 className="text-sm font-semibold text-[#1f314d]">Năng lượng đội AMR</h2><p className="mt-1 text-xs leading-5 text-[#71819a]">Mức pin được ghi nhận từ từng robot.</p></div>
        <Link to="/staff/amr" className="flex items-center gap-2 border-t border-[#edf2fa] px-5 py-3 text-[11px] font-medium text-[#647793] hover:bg-[#f1f6fe]"><ArrowUpRight size={14} aria-hidden="true" />Theo dõi đội AMR</Link>
      </article>

      <article className={panelClass}>
        <div className="m-4 mb-0 min-h-[227px] rounded-lg bg-[#f1f6fe] p-4">
          {dashboard.activeSessions.length === 0 ? <p className="py-16 text-center text-xs text-[#647793]">Chưa có phiên tour đang hoạt động.</p> : <ul className="max-h-52 space-y-4 overflow-y-auto pr-1">
            {dashboard.activeSessions.map((session) => <li key={session.id}>
              <Link to={`/staff/tours/${session.id}`} className="block truncate text-xs font-semibold text-[#2f62b8] hover:underline" title={session.routeName}>{session.routeName}</Link>
              <div className="my-2 flex items-center justify-between gap-2"><StatusBadge value={session.status} /><span className="text-xs font-semibold text-[#2f62b8]">{session.progressPercent == null ? 'Chưa có tiến độ' : `${session.progressPercent}%`}</span></div>
              {session.progressPercent != null && <div role="progressbar" aria-label={`Tiến độ ${session.routeName}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={session.progressPercent} className="h-1.5 overflow-hidden rounded-full bg-[#dce9fb]"><div className="h-full rounded-full bg-[#5b91ed]" style={{ width: `${Math.max(0, Math.min(100, session.progressPercent))}%` }} /></div>}
            </li>)}
          </ul>}
        </div>
        <div className="px-5 pt-5 pb-4"><h2 className="text-sm font-semibold text-[#1f314d]">Tiến độ hành trình</h2><p className="mt-1 text-xs leading-5 text-[#71819a]">Theo dõi các phiên tour đang hoạt động.</p></div>
        <Link to="/staff/schedule" className="flex items-center gap-2 border-t border-[#edf2fa] px-5 py-3 text-[11px] font-medium text-[#647793] hover:bg-[#f1f6fe]"><ArrowUpRight size={14} aria-hidden="true" />Mở lịch điều phối</Link>
      </article>
    </section>
  )
}

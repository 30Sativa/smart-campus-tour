import { useMemo } from 'react'
import { Activity, BatteryLow, Bot, CalendarDays, ChevronRight, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { useOpsDashboard } from '../../features/operations/operations-hooks'
import { EmptyPanel, ErrorPanel, LoadingPanel, PageHeader, panelClass, StatusBadge } from '../../features/operations/OperationsUi'
import { severityRank } from '../../features/operations/status'
import { formatBattery, formatDateTime, formatTime } from '../../features/operations/formatters'

const shell = 'min-h-full bg-[#f1f6fe] px-4 py-5 font-sans sm:px-6 lg:px-8 lg:py-7'

/**
 * Staff operations overview.
 *
 * The page answers one question: what needs my attention right now. Everything
 * is ordered by that and nothing else.
 *
 * The nine equal metric cards this replaced could not answer it. Nine numbers at
 * one weight is not a summary, it is an inventory, and an operator had to read
 * all of them to find the two that mattered. Four now carry the shift, the rest
 * moved to a secondary line where a count is enough. The number is the dominant
 * element in each tile; the icon supports it.
 */
export default function OperationsOverviewPage() {
  const dashboard = useOpsDashboard()

  const alerts = useMemo(
    () => [...(dashboard.data?.recentAlerts ?? [])].sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    [dashboard.data],
  )

  if (dashboard.isPending) return <div className={shell}><LoadingPanel /></div>
  if (dashboard.isError) return <div className={shell}><ErrorPanel error={dashboard.error} /></div>
  const data = dashboard.data

  // Four, chosen because each one can change what an operator does next.
  const primary = [
    { label: 'Tour hôm nay', value: data.todayTours, hint: `${data.upcomingTours} sắp tới`, icon: CalendarDays, tone: 'info' as const },
    { label: 'Đang diễn ra', value: data.activeTours, hint: `${data.completedTours} đã hoàn thành`, icon: Activity, tone: 'ok' as const },
    { label: 'AMR đang chạy', value: data.activeAmrs, hint: `${data.offlineAmrs} mất kết nối`, icon: Bot, tone: data.offlineAmrs > 0 ? ('warn' as const) : ('ok' as const) },
    { label: 'Cảnh báo cần xử lý', value: data.activeAlerts, hint: `${data.criticalAlerts} nghiêm trọng`, icon: TriangleAlert, tone: data.criticalAlerts > 0 ? ('danger' as const) : ('muted' as const) },
  ]

  const accent: Record<'ok' | 'info' | 'warn' | 'danger' | 'muted', string> = {
    ok: 'text-[#1f7a55]',
    info: 'text-[#2f62b8]',
    warn: 'text-[#8a5a06]',
    danger: 'text-[#b23e31]',
    muted: 'text-[#5d7085]',
  }

  return (
    <div className={shell}>
      <div className="mx-auto w-full max-w-[1500px]">
        <PageHeader
          eyebrow="Vận hành tour"
          title="Tình hình điều hành"
          description="Theo dõi tour, đội AMR và cảnh báo vận hành."
          action={<Link to="/staff/schedule" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#5b91ed] px-4 text-sm font-bold text-white shadow-[0_8px_18px_rgba(79,141,247,0.24)] hover:bg-[#407bd8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2">Xem lịch tour</Link>}
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tóm tắt ca trực">
          {primary.map(({ label, value, hint, icon: Icon, tone }) => (
            <div key={label} className={`${panelClass} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <p className={`text-[34px] leading-none font-extrabold tracking-[-0.05em] ${accent[tone]}`}>{value}</p>
                <Icon size={18} className="mt-1 shrink-0 text-[#a8b6c9]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-bold text-[#40546f]">{label}</p>
              <p className="mt-0.5 text-xs text-[#8a98ac]">{hint}</p>
            </div>
          ))}
        </section>

        {/* The counts that do not deserve a card, on one line. */}
        <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-xs text-[#71819a]">
          <span>Chờ điều phối: <strong className="font-bold text-[#40546f]">{data.pendingTours}</strong></span>
          <span>Đã hoàn thành: <strong className="font-bold text-[#40546f]">{data.completedTours}</strong></span>
          <span>AMR mất kết nối: <strong className="font-bold text-[#40546f]">{data.offlineAmrs}</strong></span>
        </p>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.8fr)]">
          <section className={panelClass} aria-label="Lịch tour hôm nay">
            <div className="flex items-center justify-between gap-3 border-b border-[#edf2fa] px-5 py-4">
              <div>
                <h2 className="font-bold text-[#40546f]">Lịch tour hôm nay</h2>
                <p className="mt-0.5 text-xs text-[#8a98ac]">Phiên tour theo lịch đã đặt</p>
              </div>
              <Link to="/staff/schedule" className="shrink-0 text-xs font-bold text-[#2f62b8] hover:underline">Mở lịch</Link>
            </div>

            {data.todaySchedule.length === 0 ? (
              <div className="p-5"><EmptyPanel>Chưa có phiên tour nào trong ngày đã chọn.</EmptyPanel></div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-[#f8fbff] text-[11px] font-bold text-[#71819a]">
                      <tr>
                        <th scope="col" className="px-5 py-3 whitespace-nowrap">Thời gian</th>
                        <th scope="col" className="px-4 py-3">Tour</th>
                        <th scope="col" className="px-4 py-3">Khách</th>
                        <th scope="col" className="px-4 py-3">AMR</th>
                        <th scope="col" className="px-5 py-3">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf2fa]">
                      {data.todaySchedule.map((tour) => (
                        <tr key={tour.sessionId} className="hover:bg-[#f8fbff]">
                          <td className="px-5 py-3 font-bold whitespace-nowrap text-[#40546f]">{formatTime(tour.startTime)}</td>
                          <td className="px-4 py-3"><Link to={`/staff/tours/${tour.sessionId}`} className="font-semibold text-[#40546f] hover:text-[#2f62b8]">{tour.routeName}</Link></td>
                          <td className="px-4 py-3 text-[#647793]">{tour.visitorName || 'Không công khai'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-[#647793]">{tour.amrName || <span className="font-semibold text-[#8a5a06]">Chưa gán</span>}</td>
                          <td className="px-5 py-3"><StatusBadge value={tour.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Five columns do not fit a phone. Same records, read as cards. */}
                <ul className="divide-y divide-[#edf2fa] md:hidden">
                  {data.todaySchedule.map((tour) => (
                    <li key={tour.sessionId}>
                      <Link to={`/staff/tours/${tour.sessionId}`} className="flex items-start justify-between gap-3 p-4 hover:bg-[#f8fbff]">
                        <div className="min-w-0">
                          <p className="font-bold text-[#40546f]">{formatTime(tour.startTime)} · {tour.routeName}</p>
                          <p className="mt-1 text-xs text-[#8a98ac]">{tour.visitorName || 'Không công khai'} · {tour.amrName || 'Chưa gán AMR'}</p>
                          <div className="mt-2"><StatusBadge value={tour.status} /></div>
                        </div>
                        <ChevronRight size={16} className="mt-1 shrink-0 text-[#a8b6c9]" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className={panelClass} aria-label="Cảnh báo cần xử lý">
            <div className="flex items-center justify-between gap-3 border-b border-[#edf2fa] px-5 py-4">
              <div>
                <h2 className="font-bold text-[#40546f]">Cảnh báo cần xử lý</h2>
                <p className="mt-0.5 text-xs text-[#8a98ac]">Nghiêm trọng trước, chưa xác nhận</p>
              </div>
              <Link to="/staff/alerts" className="shrink-0 text-xs font-bold text-[#2f62b8] hover:underline">Xem tất cả</Link>
            </div>

            {alerts.length === 0 ? (
              <div className="p-5"><EmptyPanel>Không có cảnh báo mở.</EmptyPanel></div>
            ) : (
              <ul className="divide-y divide-[#edf2fa]">
                {alerts.map((alert) => (
                  <li key={alert.id}>
                    <Link to="/staff/alerts" className="block px-5 py-4 hover:bg-[#f8fbff]">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-[#40546f]">{alert.message}</p>
                        <StatusBadge value={alert.severity} className="shrink-0" />
                      </div>
                      <p className="mt-2 text-xs text-[#8a98ac]">{alert.amrName || 'Hệ thống'} · {formatDateTime(alert.createdAt)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className={`${panelClass} mt-5`} aria-label="Đội AMR">
          <div className="flex items-center justify-between gap-3 border-b border-[#edf2fa] px-5 py-4">
            <div>
              <h2 className="font-bold text-[#40546f]">Đội AMR</h2>
              <p className="mt-0.5 text-xs text-[#8a98ac]">Trực tuyến, dữ liệu chậm và mất kết nối không được gộp thành một trạng thái khỏe mạnh.</p>
            </div>
            <Link to="/staff/amr" className="shrink-0 text-xs font-bold text-[#2f62b8] hover:underline">Theo dõi AMR</Link>
          </div>

          {data.activeAmrsList.length === 0 ? (
            <div className="p-5"><EmptyPanel>Hiện không có AMR đang vận hành hoặc cần theo dõi.</EmptyPanel></div>
          ) : (
            <ul className="grid divide-y divide-[#edf2fa] md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-3 xl:[&>li:nth-child(3n+1)]:border-l-0">
              {data.activeAmrsList.map((amr) => {
                const low = amr.batteryPercent != null && amr.batteryPercent < 20
                return (
                  <li key={amr.id} className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-bold text-[#40546f]">{amr.name}</p>
                      <StatusBadge value={amr.connectionState} className="shrink-0" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusBadge value={amr.operationalState} />
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${low ? 'border-[#f5c8c2] bg-[#fff1ef] text-[#b23e31]' : 'border-[#dbe6f4] bg-[#f6f9fd] text-[#5d7085]'}`}>
                        {low && <BatteryLow size={12} aria-hidden="true" />}
                        {amr.batteryPercent == null ? 'Chưa có số liệu pin' : `Pin ${formatBattery(amr.batteryPercent)}`}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[#8a98ac]">{amr.currentPoi || 'Chưa có vị trí'}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

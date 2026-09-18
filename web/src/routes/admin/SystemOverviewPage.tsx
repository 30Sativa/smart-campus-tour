import { lazy, Suspense, useMemo } from 'react'
import { Link } from 'react-router'
import { Activity, BatteryMedium, Bot, ChevronRight, Clock, ShieldCheck, Star, TrendingUp } from 'lucide-react'
import { useStaffAlerts, useStaffAmrs, useFeedbackReports } from '../../features/staff/staff-hooks'
import {
  CellIcon,
  ErrorPanel,
  LoadingPanel,
  PageHeader,
  PanelHead,
  StatusBadge,
  SummaryTile,
  panelClass,
} from '../../features/staff/StaffUi'
import { statusInfo } from '../../features/staff/status'
import { formatBattery, formatDateTime } from '../../features/staff/formatters'
import { ADMIN_BLOCKED_ON_BACKEND } from '../../features/administration/admin-nav'
import {
  analyticsRange,
  buildIncidentsByRobot,
  buildRobotUtilisation,
  buildTourActivity,
  summariseFleet,
  summariseRatings,
  summariseTours,
} from '../../features/administration/admin-analytics'
import { ALL_ROLES, AREAS } from '../../auth/access'

const TourActivityChart = lazy(() =>
  import('../../features/administration/charts/TourActivityChart').then((module) => ({ default: module.TourActivityChart })),
)
const RobotUtilizationChart = lazy(() =>
  import('../../features/administration/charts/RobotUtilizationChart').then((module) => ({ default: module.RobotUtilizationChart })),
)
const IncidentByRobotChart = lazy(() =>
  import('../../features/administration/charts/IncidentByRobotChart').then((module) => ({ default: module.IncidentByRobotChart })),
)

const shell = 'min-h-full bg-[#f1f6fe] px-4 py-5 font-sans sm:px-6 lg:px-8 lg:py-7'

/** A small link in a panel head. One spelling, used by every panel here. */
const headLink = 'text-xs font-bold text-[#2f62b8] hover:underline'

function ChartFallback() {
  return <p className="px-5 py-14 text-center text-sm font-medium text-[#71819a]" aria-busy="true">Đang tải biểu đồ…</p>
}

/**
 * Administration overview.
 *
 * The operations console answers "what needs me right now". This answers two
 * different questions: how has the system performed over the reporting window,
 * and is it healthy and correctly configured. So there is no today's-tour list,
 * no alert queue to work, and no dispatch action anywhere on the page. An
 * administrator reads; an operator acts, one area over.
 *
 * Every number is traced to `api/contracts/staff.ts`. Where the contract
 * carries nothing, the panel says so instead of showing a plausible figure:
 * robot utilisation has no field in any DTO, so its card renders empty rather
 * than reusing connection state as a stand-in.
 */
export default function SystemOverviewPage() {
  const range = useMemo(() => analyticsRange(7), [])
  const reports = useFeedbackReports({ from: range.from, to: range.to })
  const amrs = useStaffAmrs()
  const alerts = useStaffAlerts()

  const analytics = useMemo(() => {
    const reportRows = reports.data ?? []
    const fleet = amrs.data ?? []
    const alertRows = alerts.data ?? []
    return {
      tours: summariseTours(reportRows),
      ratings: summariseRatings(reportRows),
      activity: buildTourActivity(reportRows, range),
      health: summariseFleet(fleet),
      incidents: buildIncidentsByRobot(alertRows, fleet),
      utilisation: buildRobotUtilisation(),
      recent: [...alertRows]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
      inventory: [...fleet].sort((a, b) => {
        const rank = (v?: string | null) => ({ danger: 0, warn: 1, muted: 2, info: 3, ok: 4 })[statusInfo(v).tone] ?? 5
        return rank(a.connectionState) - rank(b.connectionState) || a.name.localeCompare(b.name, 'vi')
      }),
    }
  }, [reports.data, amrs.data, alerts.data, range])

  // The fleet query is the page's backbone: without it there is no inventory and
  // no health. Reports and alerts degrade per panel instead of blanking the page.
  if (amrs.isPending) return <div className={shell}><LoadingPanel label="Đang tải dữ liệu hệ thống…" /></div>
  if (amrs.isError) return <div className={shell}><ErrorPanel error={amrs.error} onRetry={amrs.refetch} /></div>

  const { tours, ratings, health } = analytics

  const kpis = [
    {
      label: 'Tổng tour',
      value: reports.isError ? null : String(tours.total),
      hint: `${range.days} ngày gần đây`,
      icon: TrendingUp,
    },
    {
      label: 'Tỷ lệ hoàn thành',
      value: reports.isError || tours.completionRate == null ? null : `${Math.round(tours.completionRate * 100)}%`,
      hint: tours.total > 0 ? `${tours.completed} hoàn thành, ${tours.cancelled} đã hủy` : 'Chưa có tour trong kỳ',
      icon: Activity,
    },
    {
      label: 'Điểm đánh giá',
      value: reports.isError || ratings.average == null ? null : `${ratings.average.toFixed(1)}/5`,
      hint: ratings.count > 0 ? `${ratings.count} lượt đánh giá` : 'Chưa có lượt đánh giá',
      icon: Star,
    },
    {
      label: 'AMR kết nối',
      value: `${health.live}/${health.total}`,
      hint: health.needsAttention > 0 ? `${health.needsAttention} thiết bị cần chú ý` : 'Toàn đội bình thường',
      icon: Bot,
    },
  ]

  return (
    <div className={shell}>
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader
          eyebrow="Quản trị hệ thống"
          title="Tổng quan hiệu suất"
          description={`Hiệu suất và tình trạng CampusTour trong ${range.days} ngày gần đây. Điều phối tour và xử lý cảnh báo thuộc khu vực vận hành.`}
          action={
            <Link
              to="/admin/roles"
              className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-[#5b91ed] px-4 text-sm font-bold text-white transition-colors hover:bg-[#407bd8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f8df7]"
            >
              Vai trò &amp; quyền
              <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
            </Link>
          }
        />

        {/* 1. Four figures, no more. Everything else lives in a chart or a panel.
               Same tile as the operations schedule row, so the two consoles open
               the same way. A figure the contract cannot supply says so in the
               tile rather than resolving to a zero. */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số chính">
          {kpis.map(({ label, value, hint, icon }) => (
            <SummaryTile
              key={label}
              label={label}
              icon={icon}
              hint={hint}
              value={value ?? <span className="text-sm font-bold text-[#8a98ac]">Không có dữ liệu</span>}
            />
          ))}
        </section>

        {/* 2. Primary analytics: the volume story, and the one metric that is
               still missing, stated rather than filled in. */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className={panelClass} aria-label="Hoạt động tour">
            <PanelHead title="Hoạt động tour" description="Số tour theo ngày, tách hoàn thành và đã hủy." />
            {reports.isPending ? (
              <p className="px-5 py-14 text-center text-sm font-medium text-[#71819a]" aria-busy="true">Đang tải báo cáo tour…</p>
            ) : reports.isError ? (
              <ErrorPanel error={reports.error} onRetry={reports.refetch} />
            ) : (
              <Suspense fallback={<ChartFallback />}>
                <TourActivityChart days={analytics.activity} emptyLabel={`Chưa có tour nào trong ${range.days} ngày gần đây.`} />
              </Suspense>
            )}
          </section>

          <section className={panelClass} aria-label="Mức sử dụng AMR">
            <PanelHead title="Mức sử dụng AMR" description="Tỷ lệ thời gian mỗi robot thực sự phục vụ tour." />
            <Suspense fallback={<ChartFallback />}>
              <RobotUtilizationChart
                data={analytics.utilisation}
                emptyLabel="Chưa có dữ liệu mức sử dụng AMR. Hợp đồng dữ liệu hiện tại chỉ cho biết robot có kết nối hay không, đó là thông tin khác."
              />
            </Suspense>
          </section>
        </div>

        {/* 3. Secondary analytics: reliability, and the live picture of the fleet. */}
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className={panelClass} aria-label="Sự cố theo AMR">
            <PanelHead title="Sự cố theo AMR" description="Số cảnh báo đã ghi nhận cho từng robot." />
            {alerts.isPending ? (
              <p className="px-5 py-14 text-center text-sm font-medium text-[#71819a]" aria-busy="true">Đang tải sự cố…</p>
            ) : alerts.isError ? (
              <ErrorPanel error={alerts.error} onRetry={alerts.refetch} />
            ) : (
              <Suspense fallback={<ChartFallback />}>
                <IncidentByRobotChart rows={analytics.incidents} emptyLabel="Chưa có thiết bị nào để thống kê sự cố." />
              </Suspense>
            )}
          </section>

          <section className={panelClass} aria-label="Tình trạng hệ thống">
            <PanelHead title="Tình trạng hệ thống" description="Kết nối và cảm biến của đội thiết bị, ở thời điểm hiện tại." />
            {/* The four counts keep their status colours: here a figure IS a
                severity, which is the one thing colour is allowed to mean on
                this console. A count of zero stays neutral, so the page only
                goes amber or red when something is actually wrong. */}
            <dl className="grid grid-cols-2 gap-px bg-[#edf2fa]">
              {[
                { label: 'Trực tuyến', value: health.live, tone: 'text-[#1f7a55]' },
                { label: 'Dữ liệu chậm', value: health.stale, tone: health.stale > 0 ? 'text-[#8a5a06]' : 'text-[#40546f]' },
                { label: 'Mất kết nối', value: health.disconnected, tone: health.disconnected > 0 ? 'text-[#b23e31]' : 'text-[#40546f]' },
                { label: 'Cảm biến cảnh báo', value: health.sensorWarnings, tone: health.sensorWarnings > 0 ? 'text-[#8a5a06]' : 'text-[#40546f]' },
              ].map((item) => (
                <div key={item.label} className="bg-white px-5 py-4">
                  <dt className="text-xs font-semibold text-[#71819a]">{item.label}</dt>
                  <dd className={`mt-1 text-2xl font-extrabold tracking-[-0.04em] tabular-nums ${item.tone}`}>{item.value}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-[#edf2fa] px-5 py-3 text-xs leading-5 text-[#71819a]">
              {health.oldestTelemetrySeconds == null
                ? 'Chưa có thiết bị nào báo tuổi dữ liệu telemetry.'
                : `Dữ liệu cũ nhất trong đội: ${Math.round(health.oldestTelemetrySeconds / 60)} phút.`}
              {health.lowBattery > 0 && ` ${health.lowBattery} thiết bị dưới 20% pin.`}
            </p>
          </section>
        </div>

        {/* 4. Administration snapshot: history to read, and where configuration
               lives. Only routes that exist are linked. */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section className={panelClass} aria-label="Sự cố gần đây">
            <PanelHead
              title="Sự cố gần đây"
              description="Lịch sử để đối chiếu, không phải hàng đợi xử lý."
              action={<Link to="/staff/alerts" className={headLink}>Xem toàn bộ</Link>}
            />
            {alerts.isError ? (
              <ErrorPanel error={alerts.error} onRetry={alerts.refetch} />
            ) : analytics.recent.length === 0 ? (
              <p className="p-10 text-center text-sm font-medium text-[#71819a]">Chưa ghi nhận sự cố nào.</p>
            ) : (
              <ul className="divide-y divide-[#edf2fa]">
                {analytics.recent.map((alert) => (
                  <li key={alert.id} className="flex gap-3 px-5 py-4">
                    <CellIcon icon={alert.amrName ? Bot : Activity} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-bold text-[#40546f]">{alert.amrName ?? 'Hệ thống'}</p>
                        <StatusBadge value={alert.severity} />
                      </div>
                      <p className="mt-1 text-sm leading-6 text-[#647793]">{alert.message}</p>
                      <p className="mt-1 text-xs text-[#8a98ac]">{formatDateTime(alert.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={panelClass} aria-label="Cấu hình hệ thống">
            <PanelHead title="Cấu hình" description="Những gì quản trị viên đang kiểm soát." />
            <ul className="divide-y divide-[#edf2fa]">
              <li>
                <Link
                  to="/admin/roles"
                  className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-[#f8fbff] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#4f8df7]"
                >
                  <CellIcon icon={ShieldCheck} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-[#40546f]">Vai trò &amp; quyền</span>
                    <span className="mt-0.5 block text-xs text-[#71819a]">
                      {ALL_ROLES.length} vai trò, {AREAS.length} khu vực
                    </span>
                  </span>
                  <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-[#8a98ac]" aria-hidden="true" />
                </Link>
              </li>
              <li className="flex items-center gap-3 px-5 py-4">
                <CellIcon icon={Bot} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[#40546f]">Thiết bị đã đăng ký</span>
                  <span className="mt-0.5 block text-xs text-[#71819a]">{health.total} AMR trong danh mục bên dưới</span>
                </span>
              </li>
            </ul>
            {import.meta.env.DEV && (
              <p className="border-t border-dashed border-[#dce9fb] bg-[#f8fbff] px-5 py-3 text-[11px] leading-5 text-[#71819a]">
                <span className="font-bold">DEV</span> · Chưa có contract máy chủ: {ADMIN_BLOCKED_ON_BACKEND.join(', ')}.
              </p>
            )}
          </section>
        </div>

        {/* 5. Inventory, last: reference material rather than the headline. */}
        <section className={`${panelClass} mt-5`} aria-label="Danh mục thiết bị">
          <PanelHead
            title="Danh mục thiết bị"
            description="Sắp xếp theo mức độ cần chú ý. Thiết bị có vấn đề đứng trước."
            action={<Link to="/staff/amr" className={headLink}>Xem chi tiết đội AMR</Link>}
          />

          {analytics.inventory.length === 0 ? (
            <p className="p-10 text-center text-sm font-medium text-[#71819a]">Chưa có thiết bị nào được đăng ký.</p>
          ) : (
            <>
              {/* Desktop: a table, because an administrator compares rows. Below
                  `md` the same records become cards; five columns squeezed into
                  375px is not a table, it is a wall. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-[#f8fbff] text-[11px] font-bold text-[#71819a]">
                    <tr>
                      <th scope="col" className="px-5 py-4">Thiết bị</th>
                      <th scope="col" className="px-4 py-4">Kết nối</th>
                      <th scope="col" className="px-4 py-4">Hoạt động</th>
                      <th scope="col" className="px-4 py-4">Pin</th>
                      <th scope="col" className="px-5 py-4">Cập nhật cuối</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2fa]">
                    {analytics.inventory.map((amr) => (
                      <tr key={amr.id} className="transition-colors hover:bg-[#f8fbff]">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <CellIcon icon={Bot} />
                            <span className="font-bold whitespace-nowrap text-[#40546f]">{amr.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3"><StatusBadge value={amr.connectionState} /></td>
                        <td className="px-4 py-3"><StatusBadge value={amr.operationalState} /></td>
                        <td className={`px-4 py-3 font-semibold tabular-nums ${amr.batteryPercent != null && amr.batteryPercent < 20 ? 'text-[#b23e31]' : 'text-[#647793]'}`}>{formatBattery(amr.batteryPercent)}</td>
                        <td className="px-5 py-3 whitespace-nowrap text-[#647793]">{formatDateTime(amr.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-[#edf2fa] md:hidden">
                {analytics.inventory.map((amr) => (
                  <li key={amr.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <CellIcon icon={Bot} />
                        <p className="font-bold text-[#40546f]">{amr.name}</p>
                      </div>
                      <StatusBadge value={amr.connectionState} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[#647793]">
                      <StatusBadge value={amr.operationalState} />
                      <span className={`inline-flex items-center gap-1.5 tabular-nums ${amr.batteryPercent != null && amr.batteryPercent < 20 ? 'font-bold text-[#b23e31]' : ''}`}>
                        <BatteryMedium size={14} strokeWidth={1.9} aria-hidden="true" />
                        {formatBattery(amr.batteryPercent)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock size={14} strokeWidth={1.9} aria-hidden="true" />
                        {formatDateTime(amr.lastSeenAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

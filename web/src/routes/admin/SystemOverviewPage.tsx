import { useMemo } from 'react'
import { Link } from 'react-router'
import { Activity, Bot, ShieldCheck, Star, TrendingUp } from 'lucide-react'
import { useOpsAlerts, useOpsAmrs, useFeedbackReports } from '../../features/operations/operations-hooks'
import { ErrorPanel, LoadingPanel, PageHeader, panelClass, StatusBadge } from '../../features/operations/OperationsUi'
import { statusInfo } from '../../features/operations/status'
import { formatBattery, formatDateTime } from '../../features/operations/formatters'
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
import { TourActivityChart } from '../../features/administration/charts/TourActivityChart'
import { RobotUtilizationChart } from '../../features/administration/charts/RobotUtilizationChart'
import { IncidentByRobotChart } from '../../features/administration/charts/IncidentByRobotChart'
import { ALL_ROLES } from '../../auth/access'

const shell = 'min-h-full bg-[#f4f6fa] px-4 py-5 sm:px-6 lg:px-8 lg:py-7'
const cardHead = 'flex flex-wrap items-start justify-between gap-3 border-b border-[#ecf0f5] px-5 py-4'

/**
 * Administration overview.
 *
 * The operations console answers "what needs me right now". This answers two
 * different questions: how has the system performed over the reporting window,
 * and is it healthy and correctly configured. So there is no today's-tour list,
 * no alert queue to work, and no dispatch action anywhere on the page. An
 * administrator reads; an operator acts, one area over.
 *
 * Every number is traced to `api/contracts/operations.ts`. Where the contract
 * carries nothing, the panel says so instead of showing a plausible figure:
 * robot utilisation has no field in any DTO, so its card renders empty rather
 * than reusing connection state as a stand-in.
 */
export default function SystemOverviewPage() {
  const range = useMemo(() => analyticsRange(7), [])
  const reports = useFeedbackReports({ from: range.from, to: range.to })
  const amrs = useOpsAmrs()
  const alerts = useOpsAlerts()

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
  if (amrs.isError) return <div className={shell}><ErrorPanel error={amrs.error} /></div>

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
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#33415c] px-4 text-sm font-bold text-white hover:bg-[#28334a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#33415c] focus-visible:ring-offset-2"
            >
              Vai trò &amp; quyền
            </Link>
          }
        />

        {/* 1. Four figures, no more. Everything else lives in a chart or a panel. */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Chỉ số chính">
          {kpis.map(({ label, value, hint, icon: Icon }) => (
            <div key={label} className={`${panelClass} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-3xl font-extrabold tracking-[-0.05em] text-[#1f2937]">
                  {value ?? <span className="text-xl font-bold text-[#a8b2c1]">Không có dữ liệu</span>}
                </p>
                <Icon size={18} className="mt-1 shrink-0 text-[#8792a5]" aria-hidden="true" />
              </div>
              <p className="mt-2 text-sm font-bold text-[#3c4657]">{label}</p>
              <p className="mt-0.5 text-xs leading-5 text-[#8792a5]">{hint}</p>
            </div>
          ))}
        </section>

        {/* 2. Primary analytics: the volume story, and the one metric that is
               still missing, stated rather than filled in. */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className={panelClass} aria-label="Hoạt động tour">
            <div className={cardHead}>
              <div>
                <h2 className="font-bold text-[#3c4657]">Hoạt động tour</h2>
                <p className="mt-0.5 text-xs text-[#8792a5]">Số tour theo ngày, tách hoàn thành và đã hủy.</p>
              </div>
            </div>
            {reports.isPending ? (
              <p className="px-5 py-14 text-center text-sm font-medium text-[#8792a5]" aria-busy="true">Đang tải báo cáo tour…</p>
            ) : reports.isError ? (
              <ErrorPanel error={reports.error} />
            ) : (
              <TourActivityChart days={analytics.activity} emptyLabel={`Chưa có tour nào trong ${range.days} ngày gần đây.`} />
            )}
          </section>

          <section className={panelClass} aria-label="Mức sử dụng AMR">
            <div className={cardHead}>
              <div>
                <h2 className="font-bold text-[#3c4657]">Mức sử dụng AMR</h2>
                <p className="mt-0.5 text-xs text-[#8792a5]">Tỷ lệ thời gian mỗi robot thực sự phục vụ tour.</p>
              </div>
            </div>
            <RobotUtilizationChart
              data={analytics.utilisation}
              emptyLabel="Chưa có dữ liệu mức sử dụng AMR. Hợp đồng dữ liệu hiện tại chỉ cho biết robot có kết nối hay không, đó là thông tin khác."
            />
          </section>
        </div>

        {/* 3. Secondary analytics: reliability, and the live picture of the fleet. */}
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className={panelClass} aria-label="Sự cố theo AMR">
            <div className={cardHead}>
              <div>
                <h2 className="font-bold text-[#3c4657]">Sự cố theo AMR</h2>
                <p className="mt-0.5 text-xs text-[#8792a5]">Số cảnh báo đã ghi nhận cho từng robot.</p>
              </div>
            </div>
            {alerts.isPending ? (
              <p className="px-5 py-14 text-center text-sm font-medium text-[#8792a5]" aria-busy="true">Đang tải sự cố…</p>
            ) : alerts.isError ? (
              <ErrorPanel error={alerts.error} />
            ) : (
              <IncidentByRobotChart rows={analytics.incidents} emptyLabel="Chưa có thiết bị nào để thống kê sự cố." />
            )}
          </section>

          <section className={panelClass} aria-label="Tình trạng hệ thống">
            <div className={cardHead}>
              <div>
                <h2 className="font-bold text-[#3c4657]">Tình trạng hệ thống</h2>
                <p className="mt-0.5 text-xs text-[#8792a5]">Kết nối và cảm biến của đội thiết bị, ở thời điểm hiện tại.</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-px bg-[#f0f3f7]">
              {[
                { label: 'Trực tuyến', value: health.live, tone: 'text-[#2f8f6b]' },
                { label: 'Dữ liệu chậm', value: health.stale, tone: health.stale > 0 ? 'text-[#a8761c]' : 'text-[#3c4657]' },
                { label: 'Mất kết nối', value: health.disconnected, tone: health.disconnected > 0 ? 'text-[#b23e31]' : 'text-[#3c4657]' },
                { label: 'Cảm biến cảnh báo', value: health.sensorWarnings, tone: health.sensorWarnings > 0 ? 'text-[#a8761c]' : 'text-[#3c4657]' },
              ].map((item) => (
                <div key={item.label} className="bg-white px-5 py-4">
                  <dt className="text-xs font-semibold text-[#8792a5]">{item.label}</dt>
                  <dd className={`mt-1 text-2xl font-extrabold tracking-[-0.04em] ${item.tone}`}>{item.value}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-[#ecf0f5] px-5 py-3 text-xs leading-5 text-[#8792a5]">
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
            <div className={cardHead}>
              <div>
                <h2 className="font-bold text-[#3c4657]">Sự cố gần đây</h2>
                <p className="mt-0.5 text-xs text-[#8792a5]">Lịch sử để đối chiếu, không phải hàng đợi xử lý.</p>
              </div>
              <Link to="/staff/alerts" className="text-xs font-bold text-[#4f7fca] hover:underline">Xem toàn bộ</Link>
            </div>
            {alerts.isError ? (
              <ErrorPanel error={alerts.error} />
            ) : analytics.recent.length === 0 ? (
              <p className="p-10 text-center text-sm font-medium text-[#8792a5]">Chưa ghi nhận sự cố nào.</p>
            ) : (
              <ul className="divide-y divide-[#f0f3f7]">
                {analytics.recent.map((alert) => (
                  <li key={alert.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-bold text-[#3c4657]">{alert.amrName ?? 'Hệ thống'}</p>
                      <StatusBadge value={alert.severity} />
                    </div>
                    <p className="mt-1 text-sm leading-6 text-[#6b7688]">{alert.message}</p>
                    <p className="mt-1 text-xs text-[#8792a5]">{formatDateTime(alert.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={panelClass} aria-label="Cấu hình hệ thống">
            <div className={cardHead}>
              <div>
                <h2 className="font-bold text-[#3c4657]">Cấu hình</h2>
                <p className="mt-0.5 text-xs text-[#8792a5]">Những gì quản trị viên đang kiểm soát.</p>
              </div>
            </div>
            <ul className="divide-y divide-[#f0f3f7]">
              <li>
                <Link to="/admin/roles" className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4f7fca]">
                  <span>
                    <span className="flex items-center gap-2 text-sm font-bold text-[#3c4657]">
                      <ShieldCheck size={16} className="text-[#8792a5]" aria-hidden="true" />
                      Vai trò &amp; quyền
                    </span>
                    <span className="mt-0.5 block text-xs text-[#8792a5]">{ALL_ROLES.length} vai trò, 3 khu vực</span>
                  </span>
                  <span aria-hidden="true" className="text-[#8792a5]">›</span>
                </Link>
              </li>
              <li className="px-5 py-4">
                <span className="flex items-center gap-2 text-sm font-bold text-[#3c4657]">
                  <Bot size={16} className="text-[#8792a5]" aria-hidden="true" />
                  Thiết bị đã đăng ký
                </span>
                <span className="mt-0.5 block text-xs text-[#8792a5]">{health.total} AMR trong danh mục bên dưới</span>
              </li>
            </ul>
            {import.meta.env.DEV && (
              <p className="border-t border-dashed border-[#dfe5ee] bg-[#fbfcfe] px-5 py-3 text-[11px] leading-5 text-[#8792a5]">
                <span className="font-bold">DEV</span> · Chưa có contract máy chủ: {ADMIN_BLOCKED_ON_BACKEND.join(', ')}.
              </p>
            )}
          </section>
        </div>

        {/* 5. Inventory, last: reference material rather than the headline. */}
        <section className={`${panelClass} mt-5`} aria-label="Danh mục thiết bị">
          <div className={cardHead}>
            <div>
              <h2 className="font-bold text-[#3c4657]">Danh mục thiết bị</h2>
              <p className="mt-0.5 text-xs text-[#8792a5]">Sắp xếp theo mức độ cần chú ý. Thiết bị có vấn đề đứng trước.</p>
            </div>
            <Link to="/staff/amr" className="text-xs font-bold text-[#4f7fca] hover:underline">Xem chi tiết đội AMR</Link>
          </div>

          {analytics.inventory.length === 0 ? (
            <p className="p-10 text-center text-sm font-medium text-[#8792a5]">Chưa có thiết bị nào được đăng ký.</p>
          ) : (
            <>
              {/* Desktop: a table, because an administrator compares rows. Below
                  `md` the same records become cards; five columns squeezed into
                  375px is not a table, it is a wall. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-[#f8fafc] text-[11px] font-bold text-[#6b7688]">
                    <tr>
                      <th scope="col" className="px-5 py-3">Thiết bị</th>
                      <th scope="col" className="px-4 py-3">Kết nối</th>
                      <th scope="col" className="px-4 py-3">Hoạt động</th>
                      <th scope="col" className="px-4 py-3">Pin</th>
                      <th scope="col" className="px-5 py-3">Cập nhật cuối</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f3f7]">
                    {analytics.inventory.map((amr) => (
                      <tr key={amr.id} className="hover:bg-[#f8fafc]">
                        <td className="px-5 py-3 font-bold whitespace-nowrap text-[#3c4657]">{amr.name}</td>
                        <td className="px-4 py-3"><StatusBadge value={amr.connectionState} /></td>
                        <td className="px-4 py-3"><StatusBadge value={amr.operationalState} /></td>
                        <td className={`px-4 py-3 font-semibold ${amr.batteryPercent != null && amr.batteryPercent < 20 ? 'text-[#b23e31]' : 'text-[#6b7688]'}`}>{formatBattery(amr.batteryPercent)}</td>
                        <td className="px-5 py-3 whitespace-nowrap text-[#6b7688]">{formatDateTime(amr.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-[#f0f3f7] md:hidden">
                {analytics.inventory.map((amr) => (
                  <li key={amr.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-bold text-[#3c4657]">{amr.name}</p>
                      <StatusBadge value={amr.connectionState} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6b7688]">
                      <StatusBadge value={amr.operationalState} />
                      <span className={amr.batteryPercent != null && amr.batteryPercent < 20 ? 'font-bold text-[#b23e31]' : ''}>Pin {formatBattery(amr.batteryPercent)}</span>
                      <span>{formatDateTime(amr.lastSeenAt)}</span>
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

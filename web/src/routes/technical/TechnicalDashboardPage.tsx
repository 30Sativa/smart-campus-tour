import { useState } from 'react'
import { Link } from 'react-router'
import { Activity, LoaderCircle, RefreshCw } from 'lucide-react'
import { KpiRow, KpiTile } from '../../components/ui/Charts'
import { PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import type { StatusTone } from '../../components/ui/status-tone'
import { buttonClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { Note, TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import type { TechnicalActionItem, TechnicalRobotSummary } from '../../features/technical/api/diagnostics-api'
import { connectionStatusView, reading, sensorStatusView, sourceState, sourceStateView } from '../../features/technical/diagnostics-status'
import { errorText, stamp } from '../../features/technical/technical-format'
import { useTechnicalDashboard } from '../../features/technical/technical-hooks'

const REFRESH_MS = 15_000

const severityTone: Record<string, StatusTone> = { DANGER: 'danger', WARNING: 'warn', INFO: 'info' }
const severityLabel: Record<string, string> = { DANGER: 'Nghiêm trọng', WARNING: 'Cảnh báo', INFO: 'Thông tin' }

/** Only links into this area are followed; anything else the server sends is shown as text. */
const internalLink = (url: string | null) => (url && url.startsWith('/technical/') ? url : null)

function ActionItemRow({ item }: { item: TechnicalActionItem }) {
  const to = internalLink(item.linkUrl)
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3">
      <ToneBadge tone={severityTone[item.severity] ?? 'muted'}>{severityLabel[item.severity] ?? 'Thông tin'}</ToneBadge>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#0f172a]">{item.title}</p>
        <p className="mt-0.5 text-xs text-[#475569]">{item.description}</p>
      </div>
      {to && <Link to={to} className={buttonClass('secondary', 'sm')}>Mở</Link>}
    </li>
  )
}

/**
 * The Mini PC cell: numbers appear only when the backend says the report is fresh. A stale or missing
 * report shows its state instead, so last-known CPU never reads as the current load.
 */
function MiniPcCell({ robot }: { robot: TechnicalRobotSummary }) {
  const state = sourceState(robot.hasDiagnostics, robot.diagnosticsFresh)
  if (state !== 'LIVE') return <ToneBadge tone={sourceStateView[state].tone}>{sourceStateView[state].label}</ToneBadge>
  return (
    <div className="space-y-0.5 text-[12.5px] text-[#334155]">
      <p>CPU {reading(robot.cpuPercent, '%')} · {reading(robot.cpuTemperatureCelsius, ' °C')}</p>
      <p className="text-[11.5px] text-[#64748b]">LiDAR: {sensorStatusView(robot.lidarStatus).label} · IMU: {sensorStatusView(robot.imuStatus).label}</p>
    </div>
  )
}

function BatteryCell({ robot }: { robot: TechnicalRobotSummary }) {
  const state = sourceState(robot.lastSeenAt !== null, robot.syncFresh)
  if (state === 'UNAVAILABLE' || robot.batteryPercent === null) return <span className="text-[#64748b]">-</span>
  return <span className={state === 'STALE' ? 'text-[#64748b]' : 'text-[#0f172a]'}>{robot.batteryPercent.toFixed(0)}%{state === 'STALE' && <span className="ml-1 text-[11px]">(cũ)</span>}</span>
}

export default function TechnicalDashboardPage() {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const dashboard = useTechnicalDashboard(autoRefresh ? REFRESH_MS : false)
  const data = dashboard.data
  const kpis = data?.kpis

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Tổng quan" title="Bảng điều khiển kỹ thuật"
        description="Trạng thái kết nối robot, báo cáo Mini PC và các việc kỹ thuật đang chờ. Kết nối và chẩn đoán là hai nguồn riêng, mỗi nguồn có trạng thái cập nhật của nó."
        action={<>
          <button type="button" aria-pressed={autoRefresh} className={buttonClass(autoRefresh ? 'primary' : 'secondary', 'sm')} onClick={() => setAutoRefresh(value => !value)}>
            <Activity size={14} aria-hidden="true" />{autoRefresh ? 'Tự làm mới (15s)' : 'Tự làm mới: Tắt'}
          </button>
          <button type="button" className={buttonClass('secondary', 'sm')} disabled={dashboard.isFetching} onClick={() => void dashboard.refetch()}>
            <RefreshCw size={14} className={dashboard.isFetching ? 'animate-spin' : ''} aria-hidden="true" />{dashboard.isFetching ? 'Đang tải…' : 'Làm mới ngay'}
          </button>
        </>} />

      {dashboard.isPending ? (
        <p role="status" aria-busy="true" className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] font-semibold text-[#64748b]"><LoaderCircle size={16} className="animate-spin text-[#2d719e]" aria-hidden="true" />Đang tải bảng điều khiển kỹ thuật…</p>
      ) : dashboard.isError && !data ? (
        <div role="alert" className={`${panelClass} space-y-2 p-4 text-[13px] text-[#b23e31]`}>
          <p>{errorText(dashboard.error)}</p>
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void dashboard.refetch()}>Tải lại</button>
        </div>
      ) : !data || !kpis ? null : (
        <div className="space-y-4">
          {dashboard.isError && <div role="alert"><Note tone="warn">Không cập nhật được số liệu mới. Các số bên dưới là lần tải thành công gần nhất lúc <strong>{stamp(data.collectedAt)}</strong>, không phải trạng thái hiện tại.</Note></div>}

          <KpiRow label="Tổng quan kỹ thuật">
            <KpiTile label="Robot trực tuyến" value={`${kpis.connectedRobots}/${kpis.totalRobots}`}
              note={`${kpis.disconnectedRobots} ngoại tuyến · ${kpis.awaitingDataRobots} chưa nhận dữ liệu · ${kpis.unconfirmedRobots} chưa xác nhận`}
              tone={kpis.disconnectedRobots > 0 ? 'warn' : 'plain'} to="/technical/monitoring" />
            <KpiTile label="Robot chờ kiểm tra tại chỗ" value={kpis.heldForInspectionCount} tone={kpis.heldForInspectionCount > 0 ? 'warn' : 'plain'} to="/technical/robots" />
            <KpiTile label="POI chờ kiểm chứng" value={kpis.pendingPoiVerificationsCount} to="/technical/poi-import" />
            <KpiTile label="Tuyến cần chạy lại" value={kpis.routeRerunsCount ?? 0} tone={kpis.routeRerunsCount ? 'warn' : 'plain'} to="/technical/confirmations" />
            <KpiTile label="Tuyến chờ chạy thử" value={kpis.pendingRouteTestsCount} note={`${kpis.activeMapVersionsCount} phiên bản bản đồ hợp lệ`} to="/technical/confirmations" />
          </KpiRow>

          <section className={panelClass} aria-label="Việc cần xử lý">
            <PanelHead title="Việc cần xử lý" description={`Cập nhật lúc ${stamp(data.collectedAt)}`} />
            {data.actionItems.length === 0
              ? <p className="px-4 py-6 text-[13px] text-[#64748b]">Không có việc kỹ thuật nào đang chờ.</p>
              : <ul className="divide-y divide-[#eef1f4]">{data.actionItems.map((item, index) => <ActionItemRow key={`${item.type}-${item.targetId ?? index}`} item={item} />)}</ul>}
          </section>

          <section className={panelClass} aria-label="Robot và Mini PC">
            <PanelHead title="Robot và Mini PC" description="Kết nối đến từ Fleet Sync; số liệu Mini PC chỉ hiện khi báo cáo chẩn đoán còn mới (dưới 60 giây)." />
            {data.robots.length === 0 ? <p className="px-4 py-6 text-[13px] text-[#64748b]">Chưa có robot đang sử dụng. <Link to="/technical/robots" className="font-semibold text-[#1d4ed8] underline">Đăng ký robot</Link></p> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left">
                <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>Robot</th><th className={thClass}>Kết nối</th><th className={thClass}>Pin</th><th className={thClass}>Mini PC</th><th className={thClass}>Bản đồ</th><th className={`${thClass} text-center`}>Thao tác</th></tr></thead>
                <tbody className="divide-y divide-[#eef1f4]">
                  {data.robots.map(robot => {
                    const connection = connectionStatusView(robot.connectionStatus)
                    return (
                      <tr key={robot.id} className={rowClass}>
                        <td className={tdClass}><p className="font-semibold text-[#0f172a]">{robot.displayName ?? robot.robotCode}</p><p className="font-mono text-[11.5px] text-[#64748b]">{robot.robotCode}</p></td>
                        <td className={tdClass}><ToneBadge tone={connection.tone}>{connection.label}</ToneBadge><p className="mt-0.5 text-[11.5px] text-[#64748b]">Lần nhận cuối: {stamp(robot.lastSeenAt)}</p></td>
                        <td className={tdClass}><BatteryCell robot={robot} /></td>
                        <td className={tdClass}><MiniPcCell robot={robot} /></td>
                        <td className={tdClass}>
                          <span className="font-mono text-[12.5px] text-[#334155]">{robot.assignedMapKey ?? '-'}</span>
                          {robot.contextMismatch && <p className="mt-0.5 text-[11.5px] text-amber-800">Khác bản đồ kiểm tra gần nhất</p>}
                          {robot.needsInspection && <p className="mt-0.5"><ToneBadge tone="warn">Chờ kiểm tra tại chỗ</ToneBadge></p>}
                        </td>
                        <td className={`${tdClass} text-center`}><Link to={`/technical/monitoring?robot=${encodeURIComponent(robot.robotCode)}`} aria-label={`Giám sát ${robot.robotCode}`} className={buttonClass('secondary', 'sm')}>Giám sát</Link></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            )}
          </section>
        </div>
      )}
    </TechnicalPage>
  )
}

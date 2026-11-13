import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight, LoaderCircle, RefreshCw } from 'lucide-react'
import { PageHeader, panelClass } from '../../components/ui/ConsolePrimitives'
import { dotClass, type StatusTone } from '../../components/ui/status-tone'
import { buttonClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { Note, TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { EmptyState } from '../../components/ui/EmptyState'
import type { TechnicalActionItem, TechnicalKpiSummary, TechnicalRobotSummary } from '../../features/technical/api/diagnostics-api'
import { connectionStatusView, reading, sensorStatusView, sourceState, sourceStateView } from '../../features/technical/diagnostics-status'
import { errorText } from '../../features/technical/technical-format'
import { formatDateTime } from '../../components/ui/date-time'
import { useTechnicalDashboard } from '../../features/technical/technical-hooks'

const REFRESH_MS = 15_000

const severityTone: Record<string, StatusTone> = { DANGER: 'danger', WARNING: 'warn', INFO: 'info' }
const severityLabel: Record<string, string> = { DANGER: 'Nghiêm trọng', WARNING: 'Cảnh báo' }
const severityRank: Record<string, number> = { DANGER: 0, WARNING: 1 }
const rankOf = (item: TechnicalActionItem) => severityRank[item.severity] ?? 2

const FLEET_PARTS = [
  { status: 'CONNECTED', count: 'connectedRobots' },
  { status: 'DISCONNECTED', count: 'disconnectedRobots' },
  { status: 'AWAITING_DATA', count: 'awaitingDataRobots' },
  { status: 'UNCONFIRMED', count: 'unconfirmedRobots' },
] as const

const quietLinkClass = 'inline-flex min-h-8 shrink-0 items-center gap-0.5 rounded-lg px-2 text-[13px] font-semibold text-[#1d4ed8] transition-colors hover:bg-[#eff6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]'

/** Only links into this area are followed; anything else the server sends is shown as text. */
const internalLink = (url: string | null) => (url && url.startsWith('/technical/') ? url : null)

function SectionTitle({ title, note, children }: { title: string; note?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 pt-4">
      <h2 className="text-[15px] font-semibold text-[#0f172a]">{title}</h2>
      {children}
      {note && <p className="w-full text-xs text-[#64748b] sm:ml-auto sm:w-auto">{note}</p>}
    </div>
  )
}

/** One bar answers "is the fleet up"; every state keeps its printed count, so colour is never the only carrier. */
function FleetHealth({ kpis }: { kpis: TechnicalKpiSummary }) {
  const parts = FLEET_PARTS.map(part => ({ ...connectionStatusView(part.status), status: part.status, count: kpis[part.count] }))
  return (
    <section className={`${panelClass} flex flex-col`} aria-label="Tình trạng robot">
      <SectionTitle title="Tình trạng robot" />
      <div className="flex flex-1 flex-col px-4 pt-3 pb-4">
        <Link to="/technical/monitoring" className="flex items-baseline gap-2 self-start rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]">
          <b className="text-[32px] leading-none font-bold tracking-[-0.02em] text-[#0f172a] tabular-nums">{kpis.connectedRobots}/{kpis.totalRobots}</b>
          <span className="text-[13px] text-[#64748b]">robot trực tuyến</span>
        </Link>
        <div role="img" aria-label={parts.map(part => `${part.label}: ${part.count}`).join(', ')} className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-[#eef1f4]">
          {parts.filter(part => part.count > 0).map(part => <span key={part.status} title={`${part.label}: ${part.count}`} className={dotClass[part.tone]} style={{ flexGrow: part.count }} />)}
        </div>
        <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {parts.map(part => (
            <li key={part.status} className="flex items-center gap-2 text-[12.5px] text-[#475569]">
              <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dotClass[part.tone]}`} />
              <span className="min-w-0 flex-1 truncate">{part.label}</span>
              <b className={`font-semibold tabular-nums ${part.count > 0 ? 'text-[#0f172a]' : 'text-muted'}`}>{part.count}</b>
            </li>
          ))}
        </ul>
        <dl className="mt-auto flex flex-wrap gap-x-6 gap-y-1 pt-4 text-[12.5px] text-[#64748b]">
          <div className="flex gap-1.5"><dt>Chờ kiểm tra tại chỗ</dt><dd className="font-semibold text-[#0f172a] tabular-nums">{kpis.heldForInspectionCount}</dd></div>
          <div className="flex gap-1.5"><dt>Bản đồ hợp lệ</dt><dd className="font-semibold text-[#0f172a] tabular-nums">{kpis.activeMapVersionsCount}</dd></div>
        </dl>
      </div>
    </section>
  )
}

function ActionItemRow({ item }: { item: TechnicalActionItem }) {
  const to = internalLink(item.linkUrl)
  const label = severityLabel[item.severity]
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-semibold text-[#0f172a]">{item.title}</span>
          {label && <ToneBadge tone={severityTone[item.severity]}>{label}</ToneBadge>}
        </p>
        <p className="mt-0.5 text-xs text-[#64748b]">{item.description}</p>
      </div>
      {to && <Link to={to} className={quietLinkClass}>Mở<ChevronRight size={14} aria-hidden="true" /></Link>}
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


function MapFacts({ robot }: { robot: TechnicalRobotSummary }) {
  return <>
    <span className="font-mono text-[12.5px] text-[#334155]">{robot.assignedMapKey ?? 'Chưa gán bản đồ'}</span>
    {robot.contextMismatch && <p className="mt-0.5 text-[11.5px] text-amber-800">Khác bản đồ kiểm tra gần nhất</p>}
    {robot.needsInspection && <p className="mt-0.5"><ToneBadge tone="warn">Chờ kiểm tra tại chỗ</ToneBadge></p>}
  </>
}
export default function TechnicalDashboardPage() {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const dashboard = useTechnicalDashboard(autoRefresh ? REFRESH_MS : false)
  const data = dashboard.data
  const kpis = data?.kpis
  const actionItems = data ? [...data.actionItems].sort((a, b) => rankOf(a) - rankOf(b)) : []

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Giám sát" title="Tổng quan" description="Xem tình trạng robot và xử lý việc kỹ thuật đang chờ."
        action={<>
          {data && <span className="text-xs text-[#64748b]">Cập nhật lúc {formatDateTime(data.collectedAt)}</span>}
          <button type="button" aria-pressed={autoRefresh} onClick={() => setAutoRefresh(value => !value)}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#475569] transition-colors hover:bg-[#eef1f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]">
            <span aria-hidden="true" className={`size-1.5 rounded-full ${autoRefresh ? dotClass.ok : dotClass.muted}`} />
            {autoRefresh ? 'Tự làm mới 15s' : 'Tự làm mới: Tắt'}
          </button>
          <button type="button" aria-label="Làm mới ngay" title="Làm mới ngay" disabled={dashboard.isFetching} onClick={() => void dashboard.refetch()}
            className="grid size-8 place-items-center rounded-lg border border-[#e2e8f0] bg-white text-[#475569] transition-colors hover:bg-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:opacity-60">
            <RefreshCw size={14} className={dashboard.isFetching ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
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
          {dashboard.isError && <div role="alert"><Note tone="warn">Không cập nhật được số liệu mới. Các số bên dưới là lần tải thành công gần nhất lúc <strong>{formatDateTime(data.collectedAt)}</strong>, không phải trạng thái hiện tại.</Note></div>}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <FleetHealth kpis={kpis} />

            <section className={`${panelClass} flex flex-col`} aria-label="Việc cần xử lý">
              <SectionTitle title="Việc cần xử lý">
                {actionItems.length > 0 && <span className="rounded-full bg-[#f1f5f9] px-2 text-xs font-semibold text-[#475569] tabular-nums">{actionItems.length}</span>}
              </SectionTitle>
              {actionItems.length === 0
                ? <EmptyState variant="empty" title="Chưa có việc kỹ thuật cần xử lý" className="flex-1" />
                : <ul className="mt-1.5 divide-y divide-[#eef1f4] pb-1.5">{actionItems.map((item, index) => <ActionItemRow key={`${item.type}-${item.targetId ?? index}`} item={item} />)}</ul>}
            </section>
          </div>

          <section className={panelClass} aria-label="Robot và Mini PC">
            <SectionTitle title="Robot và Mini PC" />
            {data.robots.length === 0 ? <EmptyState variant="empty" title="Chưa có robot đang sử dụng" action={<Link to="/technical/robots" className={buttonClass('secondary', 'sm')}>Đăng ký robot</Link>} /> : (
              <div className="mt-3 overflow-x-auto">
                {/* Battery sits under the connection and the map under the robot, so the table fits a narrow screen without scrolling. */}
                <table className="w-full text-left">
                <thead className="border-y border-[#eef1f4]"><tr><th className={thClass}>Robot và bản đồ</th><th className={thClass}>Kết nối và pin</th><th className={thClass}>Mini PC</th><th aria-label="Thao tác" className={thClass} /></tr></thead>
                <tbody className="divide-y divide-[#eef1f4]">
                  {data.robots.map(robot => {
                    const connection = connectionStatusView(robot.connectionStatus)
                    return (
                      <tr key={robot.id} className={rowClass}>
                        <td className={tdClass}><p className="font-semibold text-[#0f172a]">{robot.displayName ?? robot.robotCode}</p><p className="font-mono text-[11.5px] text-[#64748b]">{robot.robotCode}</p>
                          <div className="mt-1"><MapFacts robot={robot} /></div></td>
                        <td className={tdClass}><ToneBadge tone={connection.tone}>{connection.label}</ToneBadge>{robot.lastSeenAt && <p className="mt-0.5 text-[11.5px] text-[#64748b]">Lần nhận cuối: {formatDateTime(robot.lastSeenAt)}</p>}
                          <p className="mt-0.5 text-[12.5px]">Pin <BatteryCell robot={robot} /></p></td>
                        <td className={tdClass}><MiniPcCell robot={robot} /></td>
                        <td className={`${tdClass} text-right`}><Link to={`/technical/monitoring?robot=${encodeURIComponent(robot.robotCode)}`} aria-label={`Giám sát ${robot.robotCode}`} className={quietLinkClass}>Giám sát<ChevronRight size={14} aria-hidden="true" /></Link></td>
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

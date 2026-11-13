import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Activity, LoaderCircle, RefreshCw } from 'lucide-react'
import { PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { DetailFact, Note, TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import type { RobotDiagnosticsDetail, SensorStatus } from '../../features/technical/api/diagnostics-api'
import {
  connectionStatusView, flagLabel, formatBytes, middlewareStatusView, nav2StateLabel, nodeStatusView,
  mostRecentRobot, reading, sensorStatusView, sourceState, sourceStateView, type SourceState,
} from '../../features/technical/diagnostics-status'
import { errorText } from '../../features/technical/technical-format'
import { formatDateTime } from '../../components/ui/date-time'
import { useRobotDiagnostics, useTechnicalDashboard } from '../../features/technical/technical-hooks'

const REFRESH_MS = 15_000

function SourceBadge({ state }: { state: SourceState }) {
  return <ToneBadge tone={sourceStateView[state].tone}>{sourceStateView[state].label}</ToneBadge>
}

/** A panel fed by one report section. Without a report the panel says so instead of printing empty numbers. */
function ReportPanel({ title, description, state, missing, children }: { title: string; description: string; state: SourceState; missing: string | null; children: ReactNode }) {
  return (
    <section className={panelClass} aria-label={title}>
      <PanelHead title={title} description={description} action={state === 'UNAVAILABLE' ? undefined : <SourceBadge state={state} />} />
      <div className={`px-4 py-2 ${state === 'STALE' ? 'opacity-75' : ''}`}>
        {state === 'UNAVAILABLE' ? <p className="py-3 text-[13px] text-[#64748b]">Chưa có dữ liệu</p>
          : missing ? <p className="py-3 text-[13px] text-[#64748b]">{missing}</p>
            : <dl className="divide-y divide-[#f1f5f9]">{children}</dl>}
      </div>
    </section>
  )
}

function SensorFact({ label, sensor }: { label: string; sensor: SensorStatus }) {
  const view = sensorStatusView(sensor.status)
  return (
    <DetailFact label={label}>
      <span className="flex flex-wrap items-center gap-2">
        <ToneBadge tone={view.tone}>{view.label}</ToneBadge>
        {sensor.status !== 'NOT_EQUIPPED' && <span className="text-[12px] text-[#64748b]">{sensor.rateHz !== null ? `${sensor.rateHz.toFixed(1)} Hz` : 'Tần số: không đo được'} · hợp lệ lần cuối {formatDateTime(sensor.lastValidAt)}</span>}
      </span>
      {sensor.message && <p className="mt-0.5 text-[12px] text-[#475569]">{sensor.message}</p>}
    </DetailFact>
  )
}

function RobotDiagnosticsView({ detail }: { detail: RobotDiagnosticsDetail }) {
  const connection = connectionStatusView(detail.connectionStatus)
  const telemetry = sourceState(detail.lastSeenAt !== null, detail.telemetryFresh)
  const diagnostics = sourceState(detail.lastDiagnosticsReceivedAt !== null, detail.diagnosticsFresh)
  const miniPc = detail.miniPc
  const ros2 = detail.ros2
  const sensors = detail.sensors
  const gpu = miniPc?.gpu ?? null

  return (
    <div className="space-y-4">
      {diagnostics === 'UNAVAILABLE' && <Note tone="info">Kiểm tra bộ thu thập chẩn đoán trên Mini PC của robot này đã chạy và gửi báo cáo chưa.</Note>}
      {diagnostics === 'STALE' && <Note tone="warn">Báo cáo chẩn đoán gần nhất lúc <strong>{formatDateTime(detail.lastDiagnosticsReceivedAt)}</strong> đã quá 60 giây. Số liệu Mini PC, ROS 2 và cảm biến bên dưới là giá trị cuối cùng, không phải trạng thái hiện tại.</Note>}
      {telemetry === 'STALE' && <Note tone="warn">Fleet Sync không còn cập nhật từ lúc <strong>{formatDateTime(detail.lastSeenAt)}</strong>. Pin, vị trí và trạng thái định vị là giá trị cuối cùng.</Note>}

      <section className={panelClass} aria-label="Kết nối và vận hành">
        <PanelHead title="Kết nối và vận hành" description="Từ Fleet Sync và hồ sơ robot trên backend." action={<ToneBadge tone={connection.tone}>{connection.label}</ToneBadge>} />
        <dl className="divide-y divide-[#f1f5f9] px-4 py-2">
          <DetailFact label="Fleet Sync"><span className="flex flex-wrap items-center gap-2"><SourceBadge state={telemetry} />{detail.lastSeenAt && <span className="text-[12px] text-[#64748b]">Lần nhận cuối: {formatDateTime(detail.lastSeenAt)}</span>}</span></DetailFact>
          <DetailFact label="Chẩn đoán Mini PC"><span className="flex flex-wrap items-center gap-2"><SourceBadge state={diagnostics} />{detail.lastDiagnosticsReceivedAt && <span className="text-[12px] text-[#64748b]">Lần nhận cuối: {formatDateTime(detail.lastDiagnosticsReceivedAt)}</span>}</span></DetailFact>
          <DetailFact label="Pin">{telemetry === 'UNAVAILABLE' ? '-' : reading(detail.batteryPercent, '%')}</DetailFact>
          <DetailFact label="Định vị">{telemetry === 'UNAVAILABLE' ? '-' : flagLabel(detail.localized, 'Đã định vị', 'Chưa định vị')}</DetailFact>
          <DetailFact label="Sẵn sàng di chuyển">{telemetry === 'UNAVAILABLE' ? '-' : flagLabel(detail.motionReady, 'Sẵn sàng', 'Chưa sẵn sàng')}</DetailFact>
          <DetailFact label="Vị trí">{detail.pose ? <span className="font-mono text-[12.5px]">x {detail.pose.x.toFixed(2)} · y {detail.pose.y.toFixed(2)} · yaw {detail.pose.yaw.toFixed(2)} (lúc {formatDateTime(detail.pose.capturedAt)})</span> : '-'}</DetailFact>
          <DetailFact label="Mã lỗi robot">{detail.faultCode ? <span className="font-mono text-[12.5px]">{detail.faultCode}</span> : '-'}</DetailFact>
          <DetailFact label="Bản đồ được gán">{detail.assignedMapKey ? <span className="font-mono text-[12.5px]">{detail.assignedMapKey} · {detail.assignedFrameId}{detail.assignedAreaName ? ` (${detail.assignedAreaName}, v${detail.assignedVersionNumber})` : ''}</span> : 'Chưa gán'}</DetailFact>
          <DetailFact label="Kiểm tra triển khai">{detail.latestDeployedMapKey ? <span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12.5px]">{detail.latestDeployedMapKey} · {detail.latestDeployedFrameId}</span>{detail.latestDeploymentPassed !== null && <ToneBadge tone={detail.latestDeploymentPassed ? 'ok' : 'danger'}>{detail.latestDeploymentPassed ? 'Đạt' : 'Chưa đạt'}</ToneBadge>}</span> : 'Chưa ghi nhận'}</DetailFact>
          <DetailFact label="Tour hiện tại">{detail.currentTourName ?? '-'}{detail.needsInspection && <span className="ml-2"><ToneBadge tone="warn">Chờ kiểm tra tại chỗ</ToneBadge></span>}</DetailFact>
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportPanel title="Tài nguyên Mini PC" description="CPU, bộ nhớ, ổ đĩa và GPU do Mini PC tự báo cáo." state={diagnostics} missing={miniPc ? null : 'Báo cáo gần nhất không có phần tài nguyên Mini PC.'}>
          {miniPc && <>
            <DetailFact label="CPU">{reading(miniPc.cpuPercent, '%')}</DetailFact>
            <DetailFact label="Nhiệt độ CPU">{reading(miniPc.cpuTemperatureCelsius, ' °C')}</DetailFact>
            <DetailFact label="Bộ nhớ RAM">{miniPc.memory ? `${miniPc.memory.usedPercent.toFixed(0)}% · ${formatBytes(miniPc.memory.usedBytes)} / ${formatBytes(miniPc.memory.totalBytes)}` : 'Không đo được'}</DetailFact>
            <DetailFact label="Ổ đĩa">{miniPc.disk ? `${miniPc.disk.usedPercent.toFixed(0)}% · còn trống ${formatBytes(miniPc.disk.availableFreeBytes)} (${miniPc.disk.mountPoint})` : 'Không đo được'}</DetailFact>
            <DetailFact label="GPU">{!gpu ? 'Không đo được' : !gpu.supported ? 'Không áp dụng (không có GPU được hỗ trợ)' : `${reading(gpu.utilizationPercent, '%')} · ${reading(gpu.temperatureCelsius, ' °C')}${gpu.modelName ? ` · ${gpu.modelName}` : ''}`}</DetailFact>
          </>}
        </ReportPanel>

        <ReportPanel title="Cảm biến" description="Tình trạng cảm biến do robot báo cáo." state={diagnostics} missing={sensors ? null : 'Báo cáo gần nhất không có phần cảm biến.'}>
          {sensors && <>
            <SensorFact label="LiDAR" sensor={sensors.lidar} />
            <SensorFact label="Odometry" sensor={sensors.odometry} />
            <SensorFact label="Camera độ sâu" sensor={sensors.depthCamera} />
            <DetailFact label="IMU">
              <span className="flex flex-wrap items-center gap-2"><ToneBadge tone={sensorStatusView(sensors.imu.status).tone}>{sensorStatusView(sensors.imu.status).label}</ToneBadge><span className="text-[12px] text-[#64748b]">Yaw: {flagLabel(sensors.imu.yawValid, 'hợp lệ', 'không hợp lệ')} · mất tín hiệu {sensors.imu.outages} lần · hợp lệ lần cuối {formatDateTime(sensors.imu.lastValidAt)}</span></span>
              {sensors.imu.message && <p className="mt-0.5 text-[12px] text-[#475569]">{sensors.imu.message}</p>}
            </DetailFact>
          </>}
        </ReportPanel>
      </div>

      <ReportPanel title="ROS 2" description="Middleware, TF, Nav2 và các node do robot báo cáo." state={diagnostics} missing={ros2 ? null : 'Báo cáo gần nhất không có phần ROS 2.'}>
        {ros2 && <>
          <DetailFact label="Middleware"><ToneBadge tone={middlewareStatusView(ros2.middlewareStatus).tone}>{middlewareStatusView(ros2.middlewareStatus).label}</ToneBadge></DetailFact>
          <DetailFact label="TF">{flagLabel(ros2.tfValid, 'Hợp lệ', 'Không hợp lệ')}</DetailFact>
          <DetailFact label="Nav2">{nav2StateLabel(ros2.nav2State)}</DetailFact>
          <DetailFact label="Node">
            {ros2.nodes.length === 0 ? 'Báo cáo không liệt kê node nào.' : (
              <div className="overflow-x-auto"><table className="w-full min-w-[360px] text-left">
                <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>Node</th><th className={thClass}>Trạng thái</th><th className={thClass}>Tần số</th></tr></thead>
                <tbody className="divide-y divide-[#eef1f4]">{ros2.nodes.map(node => <tr key={node.nodeName} className={rowClass}>
                  <td className={`${tdClass} font-mono text-[12.5px]`}>{node.nodeName}</td>
                  <td className={tdClass}><ToneBadge tone={nodeStatusView(node.state).tone}>{nodeStatusView(node.state).label}</ToneBadge></td>
                  <td className={`${tdClass} text-[12.5px]`}>{node.rateHz !== null ? `${node.rateHz.toFixed(1)} Hz` : 'Không đo được'}</td>
                </tr>)}</tbody>
              </table></div>
            )}
          </DetailFact>
        </>}
      </ReportPanel>
    </div>
  )
}

/** One robot at a time, chosen by `?robot=<robotCode>` so the dashboard can link straight to it. */
export default function TechnicalMonitoringPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [autoRefresh, setAutoRefresh] = useState(true)
  const interval = autoRefresh ? REFRESH_MS : false
  const robots = useTechnicalDashboard(false)
  const robotCode = searchParams.get('robot') ?? mostRecentRobot(robots.data?.robots ?? [])?.robotCode ?? ''
  const detail = useRobotDiagnostics(robotCode, interval)

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Giám sát" title="Giám sát robot và Mini PC" description="Chọn robot để xem kết nối, tài nguyên Mini PC, cảm biến và ROS 2."
        action={<>
          <button type="button" aria-pressed={autoRefresh} className={buttonClass(autoRefresh ? 'primary' : 'secondary', 'sm')} onClick={() => setAutoRefresh(value => !value)}>
            <Activity size={14} aria-hidden="true" />{autoRefresh ? 'Tự làm mới (15s)' : 'Tự làm mới: Tắt'}
          </button>
          <button type="button" className={buttonClass('secondary', 'sm')} disabled={!robotCode || detail.isFetching} onClick={() => void detail.refetch()}>
            <RefreshCw size={14} className={detail.isFetching ? 'animate-spin' : ''} aria-hidden="true" />{detail.isFetching ? 'Đang tải…' : 'Làm mới ngay'}
          </button>
        </>} />

      <div className="mb-4 max-w-md">
        <label htmlFor="monitoring-robot" className={labelClass}>Robot</label>
        <select title="" id="monitoring-robot" className={`${inputClass} mt-1`} value={robotCode} disabled={robots.isPending || robots.isError || !robots.data?.robots.length}
          onChange={event => setSearchParams(event.target.value ? { robot: event.target.value } : {})}>
          {!robots.data?.robots.some(robot => robot.robotCode === robotCode) && <option value={robotCode}>{robotCode || '- Chọn robot -'}</option>}
          {robots.data?.robots.map(robot => <option key={robot.id} value={robot.robotCode}>{robot.displayName ? `${robot.displayName} · ` : ''}{robot.robotCode}</option>)}
        </select>
        {robots.isError && <p role="alert" className="mt-1 text-sm text-[#b23e18]">{errorText(robots.error)}</p>}
      </div>

      {!robotCode ? (
        robots.isPending ? <p role="status" className="text-[13px] text-[#64748b]">Đang tải danh sách robot…</p>
          : <p className="text-[13px] text-[#64748b]">Chưa có robot đang sử dụng để giám sát.</p>
      ) : detail.isPending ? (
        <p role="status" aria-busy="true" className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] font-semibold text-[#64748b]"><LoaderCircle size={16} className="animate-spin text-[#2d719e]" aria-hidden="true" />Đang tải chẩn đoán robot…</p>
      ) : detail.isError && !detail.data ? (
        <div role="alert" className={`${panelClass} space-y-2 p-4 text-[13px] text-[#b23e31]`}>
          <p>{errorText(detail.error)}</p>
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void detail.refetch()}>Tải lại</button>
        </div>
      ) : detail.data ? (
        <>
          {detail.isError && <div role="alert" className="mb-4"><Note tone="warn">Không tải được số liệu mới. Trang đang hiện lần tải thành công gần nhất, không phải trạng thái hiện tại.</Note></div>}
          <RobotDiagnosticsView detail={detail.data} />
        </>
      ) : null}
    </TechnicalPage>
  )
}

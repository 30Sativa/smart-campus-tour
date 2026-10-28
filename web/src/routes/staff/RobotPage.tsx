import { useState } from 'react'
import { Bot, CheckCheck, Cpu, PanelRightClose, PanelRightOpen, ShieldAlert, Wrench } from 'lucide-react'
import { Link } from 'react-router'
import { ApiError } from '../../api/client'
import type { AmrStatus } from '../../api/contracts/staff'
import { useConfirmRobotReady, useStaffAmrs } from '../../features/staff/staff-hooks'
import { EmptyPanel, ErrorPanel, LiveDot, StaffPage, StatusBadge } from '../../features/staff/StaffUi'
import { LoadingPanel, PageHeader } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { useNow } from '../../features/staff/use-now'
import { BatteryMeter, RobotTelemetry, SourceBadge } from '../../features/staff/components/RobotParts'
import { OperationalTwin } from '../../features/staff/components/OperationalTwin'
import { DeviceCard, QuestMonitor, Stat } from '../../features/staff/components/DeviceMonitors'
import { robotIssues } from '../../features/staff/attention'
import { statusInfo } from '../../features/staff/status'
import { formatHeartbeat } from '../../features/staff/formatters'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { useDeviceRailStore } from '../../stores/device-rail-store'
import { notify } from '../../components/ui/toast-store'
import { KpiRow, KpiTile } from '../../components/ui/Charts'

/**
 * Robot & devices management. Monitors physical, Gazebo and emulator fleet.
 */
export default function RobotPage() {
  const robots = useStaffAmrs()
  const now = useNow(1000)
  const railHidden = useDeviceRailStore((state) => state.hidden)
  const toggleRail = useDeviceRailStore((state) => state.toggle)
  // A full-screen map must paint above the device column: the sticky map column
  // is its own stacking context, so it is lifted while the map is expanded.
  const [mapExpanded, setMapExpanded] = useState(false)

  const data = robots.data ?? []
  const total = data.length
  const available = data.filter((r) => r.connectionState === 'Live' && !r.needsCheck && !r.currentTourCode).length
  const inTour = data.filter((r) => r.currentTourCode || r.currentSessionId).length
  const needsCheck = data.filter((r) => r.needsCheck || r.headFault || r.connectionState !== 'Live').length
  // The headset rides on the physical robot, so its card sits right after it.
  const onCar = data.filter((r) => r.assignable !== false && r.source !== 'Gazebo' && r.source !== 'Emulator')
  const others = data.filter((r) => !onCar.includes(r))

  return (
    <StaffPage wide>
      <PageHeader
        eyebrow="Điều hành"
        title="Robot & Thiết bị"
        description="Kết nối, định vị, đầu xoay, telemetry và trạng thái phục vụ của hạm đội robot tự hành trong khuôn viên."
        action={
          <>
            <button type="button" onClick={toggleRail} aria-pressed={!railHidden} className={buttonClass('secondary', 'md')}>
              {railHidden ? <PanelRightOpen size={15} aria-hidden="true" /> : <PanelRightClose size={15} aria-hidden="true" />}
              {railHidden ? 'Hiện robot & kính' : 'Ẩn robot & kính'}
            </button>
            <Link to="/staff/digital-twin" className={buttonClass('secondary', 'md')}>
              <Cpu size={15} aria-hidden="true" />
              Mô phỏng 3D Digital Twin
            </Link>
          </>
        }
      />

      <KpiRow label="Tóm tắt hạm đội">
        <KpiTile label="Tổng số robot" value={total} />
        <KpiTile label="Sẵn sàng nhận tour" value={available} note={total ? `trên ${total}` : undefined} />
        <KpiTile label="Đang chạy tour" value={inTour} />
        <KpiTile label="Cần kiểm tra" value={needsCheck} tone={needsCheck > 0 ? 'danger' : 'plain'} />
      </KpiRow>

      {/* The fleet map is the centre of the page; robots and the Meta Quest 3 headset sit
          beside it as compact cards that open in place ("Xem chi tiết"). The headset reads
          its own source (the robot miniPC), so it shows even when the robot list fails.
          Map beside the rail from xl, map first then the cards below. */}
      <div className={`grid grid-cols-1 items-start gap-3 ${railHidden ? '' : 'xl:grid-cols-[minmax(0,1fr)_340px]'}`}>
        <section className={`min-w-0 xl:sticky xl:top-20 ${mapExpanded ? 'z-[60]' : ''}`} aria-label="Bản đồ vị trí hạm đội">
          {robots.isPending ? (
            <LoadingPanel />
          ) : robots.isError ? (
            <ErrorPanel error={robots.error} onRetry={robots.refetch} />
          ) : data.length === 0 ? (
            <EmptyPanel>Chưa có robot nào kết nối tới hệ thống.</EmptyPanel>
          ) : (
            <OperationalTwin robots={data} title="Bản đồ vị trí hạm đội" onExpandedChange={setMapExpanded} className="h-[560px] sm:h-[600px] xl:h-[clamp(600px,calc(100vh-230px),820px)]" />
          )}
        </section>
        {/* Hidden means unmounted: the headset card stops polling the miniPC too. */}
        {!railHidden && <aside className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1" aria-label="Thiết bị">
          <h2 className="text-[11.5px] font-medium text-[#94a3b8] sm:col-span-2 xl:col-span-1">Thiết bị trên xe</h2>
          {onCar.map((robot) => (
            <RobotCard key={robot.id} robot={robot} now={now} />
          ))}
          <QuestMonitor />
          {others.map((robot) => (
            <RobotCard key={robot.id} robot={robot} now={now} />
          ))}
        </aside>}
      </div>
    </StaffPage>
  )
}

function RobotCard({ robot, now }: { robot: AmrStatus; now: number }) {
  const confirm = useConfirmRobotReady()
  const [open, setOpen] = useState(false)
  const issues = robotIssues(robot)
  const connection = statusInfo(robot.connectionState)
  const doing = robot.currentTourCode
    ? `Đang phục vụ ${robot.currentTourCode}`
    : robot.assignable === false
    ? 'Chỉ dùng diễn tập / nghiên cứu'
    : 'Không phục vụ buổi nào'

  return (
    <div className={`min-w-0 ${robot.assignable === false ? 'opacity-90' : ''}`}>
      <DeviceCard
        label={robot.name}
        icon={<Bot size={18} strokeWidth={2} />}
        title={<span className="font-mono">{robot.name}</span>}
        tag={<><SourceBadge source={robot.source} /><span className="truncate">{doing}</span></>}
        badge={
          issues.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#fde68a] bg-[#fffbeb] px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-[#d97706]">
              <ShieldAlert size={12} aria-hidden="true" />
              {issues.length} cảnh báo
            </span>
          ) : (
            <StatusBadge value="Healthy" />
          )
        }
        footer={
          <>
            <LiveDot tone={connection.tone} pulse={false} />
            <span className="truncate">Telemetry · {formatHeartbeat(robot.telemetryAgeSeconds, robot.lastSeenAt, now)}</span>
          </>
        }
        details={
          <>
            {robot.needsCheck && (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[11.5px] leading-relaxed text-[#b45309]">
                <Wrench size={14} className="mt-0.5 shrink-0 text-[#d97706]" aria-hidden="true" />
                <span>
                  Robot đang được giữ sau khi kết thúc sớm hoặc gặp sự cố.{' '}
                  {robot.executionState === 'Unknown'
                    ? 'Chưa có tín hiệu xác nhận robot đã dừng an toàn.'
                    : 'Kiểm tra tại chỗ robot đã dừng, đầu xoay ở FRONT, sau đó bấm Xác nhận sẵn sàng.'}
                </span>
              </p>
            )}
            <RobotTelemetry robot={robot} now={now} />
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Kết nối" tone={connection.tone}>{connection.label}</Stat>
          <Stat label="Pin">
            <span className="w-full"><BatteryMeter value={robot.batteryPercent} /></span>
          </Stat>
        </div>
        {issues.length > 0 && <p className="text-[11.5px] font-semibold text-[#d97706]">{issues.join(' · ')}</p>}
        {robot.needsCheck && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#b45309]">
              <Wrench size={13} aria-hidden="true" />
              Đang giữ chờ kiểm tra
            </span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              disabled={robot.executionState === 'Unknown'}
              className={buttonClass('primary', 'sm')}
            >
              <CheckCheck size={14} aria-hidden="true" />
              Xác nhận sẵn sàng
            </button>
          </div>
        )}
      </DeviceCard>
      <ConfirmationDialog
        open={open}
        title={`Xác nhận ${robot.name} sẵn sàng?`}
        description="Chỉ xác nhận khi đã kiểm tra thực tế: robot đứng yên, đầu xoay ở FRONT, không còn nhiệm vụ cũ dở dang. Sau đó robot có thể nhận nhiệm vụ mới."
        confirmLabel="Xác nhận sẵn sàng"
        reasonLabel="Ghi chú kiểm tra tại chỗ"
        busy={confirm.isPending}
        error={confirm.isError ? (confirm.error instanceof ApiError ? confirm.error.body : 'Không xác nhận được.') : null}
        onCancel={() => {
          setOpen(false)
          confirm.reset()
        }}
        onConfirm={(note) => confirm.mutate({ robotId: robot.id, note }, { onSuccess: () => {
          notify({ title: `${robot.name} sẵn sàng cho buổi kế tiếp`, detail: 'Đã ghi xác nhận sau tour vào nhật ký robot.' })
          setOpen(false)
        } })}
      />
    </div>
  )
}

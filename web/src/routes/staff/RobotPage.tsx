import { useState } from 'react'
import { Bot, CheckCheck, Cpu, ShieldAlert, Sparkles, Wrench } from 'lucide-react'
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

/**
 * Robot & devices management. Monitors physical, Gazebo and emulator fleet.
 */
export default function RobotPage() {
  const robots = useStaffAmrs()
  const now = useNow(1000)

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
        eyebrow="Quản lý Thiết bị"
        title="Robot & Thiết bị"
        description="Kết nối, định vị, đầu xoay, telemetry và trạng thái phục vụ của hạm đội robot tự hành trong khuôn viên."
        action={
          <Link to="/staff/digital-twin" className={buttonClass('secondary', 'md')}>
            <Cpu size={16} />
            Mô phỏng 3D Digital Twin
          </Link>
        }
      />

      {/* ── Summary Stats ────────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex items-center gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f8fafc] text-[#64748b]">
            <Bot size={20} />
          </span>
          <div>
            <span className="text-xs font-bold text-[#64748b]">Tổng số robot</span>
            <span className="block text-2xl font-black text-[#0f172a] tabular-nums leading-none mt-1">{total}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ecfdf5] text-[#16a34a]">
            <Sparkles size={20} />
          </span>
          <div>
            <span className="text-xs font-bold text-[#16a34a]">Sẵn sàng nhận tour</span>
            <span className="block text-2xl font-black text-[#0f172a] tabular-nums leading-none mt-1">{available}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
            <Cpu size={20} />
          </span>
          <div>
            <span className="text-xs font-bold text-[#2563eb]">Đang chạy tour</span>
            <span className="block text-2xl font-black text-[#0f172a] tabular-nums leading-none mt-1">{inTour}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-xl ${
              needsCheck > 0 ? 'bg-[#fef2f2] text-[#dc2626]' : 'bg-[#f8fafc] text-[#64748b]'
            }`}
          >
            <ShieldAlert size={20} />
          </span>
          <div>
            <span className={`text-xs font-bold ${needsCheck > 0 ? 'text-[#dc2626]' : 'text-[#64748b]'}`}>
              Cần kiểm tra
            </span>
            <span className="block text-2xl font-black text-[#0f172a] tabular-nums leading-none mt-1">
              {needsCheck}
            </span>
          </div>
        </div>
      </div>

      {/* The fleet map is the centre of the page; robots and the Meta Quest 3 headset sit
          beside it as compact cards that open in place ("Xem chi tiết"). The headset reads
          its own source (the robot miniPC), so it shows even when the robot list fails.
          Map beside the rail from xl, map first then the cards below. */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 xl:sticky xl:top-20" aria-label="Bản đồ vị trí hạm đội">
          {robots.isPending ? (
            <LoadingPanel />
          ) : robots.isError ? (
            <ErrorPanel error={robots.error} onRetry={robots.refetch} />
          ) : data.length === 0 ? (
            <EmptyPanel>Chưa có robot nào kết nối tới hệ thống.</EmptyPanel>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f1f5f9] px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#10b981] animate-pulse" />
                  <h3 className="text-sm font-bold text-[#0f172a]">Bản đồ vị trí hạm đội</h3>
                </div>
                <span className="text-xs text-[#64748b]">Vị trí robot · 3D · {data.length} robot</span>
              </div>
              <OperationalTwin robots={data} className="h-[420px] sm:h-[520px] xl:h-[clamp(540px,calc(100vh-250px),780px)]" />
            </div>
          )}
        </section>
        <aside className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1" aria-label="Thiết bị">
          {onCar.map((robot) => (
            <RobotCard key={robot.id} robot={robot} now={now} />
          ))}
          <QuestMonitor />
          {others.map((robot) => (
            <RobotCard key={robot.id} robot={robot} now={now} />
          ))}
        </aside>
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
        onConfirm={(note) => confirm.mutate({ robotId: robot.id, note }, { onSuccess: () => setOpen(false) })}
      />
    </div>
  )
}

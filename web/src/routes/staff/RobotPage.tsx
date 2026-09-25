import { useState } from 'react'
import { Bot, CheckCheck, Cpu, ShieldAlert, Sparkles, Wrench } from 'lucide-react'
import { Link } from 'react-router'
import { ApiError } from '../../api/client'
import type { AmrStatus } from '../../api/contracts/staff'
import { useConfirmRobotReady, useStaffAmrs } from '../../features/staff/staff-hooks'
import { EmptyPanel, ErrorPanel, LoadingPanel, PageHeader, panelClass, StaffPage } from '../../features/staff/StaffUi'
import { buttonClass } from '../../features/staff/ui-classes'
import { useNow } from '../../features/staff/use-now'
import { RobotHeader, RobotTelemetry } from '../../features/staff/components/RobotParts'
import { OperationalTwin } from '../../features/staff/components/OperationalTwin'
import { ConfirmationDialog } from '../../features/staff/components/ConfirmationDialog'

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
        <div className="flex items-center gap-3 rounded-2xl border border-[#ebebe4] bg-white shadow-[0_4px_20px_-8px_rgba(28,28,28,0.16)] p-4 shadow-xs">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f7f7f3] text-[#6b6e75]">
            <Bot size={20} />
          </span>
          <div>
            <span className="text-xs font-bold text-[#6b6e75]">Tổng số robot</span>
            <span className="block text-2xl font-black text-[#1c1c1c] tabular-nums leading-none mt-1">{total}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#ebebe4] bg-white shadow-[0_4px_20px_-8px_rgba(28,28,28,0.16)] p-4 shadow-xs">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f2f7e4] text-[#5f7a12]">
            <Sparkles size={20} />
          </span>
          <div>
            <span className="text-xs font-bold text-[#5f7a12]">Sẵn sàng nhận tour</span>
            <span className="block text-2xl font-black text-[#1c1c1c] tabular-nums leading-none mt-1">{available}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#ebebe4] bg-white shadow-[0_4px_20px_-8px_rgba(28,28,28,0.16)] p-4 shadow-xs">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#1c1c1c] text-[#bde74e] shadow-[0_6px_14px_-6px_rgba(28,28,28,0.6)]">
            <Cpu size={20} />
          </span>
          <div>
            <span className="text-xs font-bold text-[#4d6410]">Đang chạy tour</span>
            <span className="block text-2xl font-black text-[#1c1c1c] tabular-nums leading-none mt-1">{inTour}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#ebebe4] bg-white shadow-[0_4px_20px_-8px_rgba(28,28,28,0.16)] p-4 shadow-xs">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-xl ${
              needsCheck > 0 ? 'bg-[#fef2f2] text-[#dc2626]' : 'bg-[#f7f7f3] text-[#6b6e75]'
            }`}
          >
            <ShieldAlert size={20} />
          </span>
          <div>
            <span className={`text-xs font-bold ${needsCheck > 0 ? 'text-[#dc2626]' : 'text-[#6b6e75]'}`}>
              Cần kiểm tra
            </span>
            <span className="block text-2xl font-black text-[#1c1c1c] tabular-nums leading-none mt-1">
              {needsCheck}
            </span>
          </div>
        </div>
      </div>

      {robots.isPending ? (
        <LoadingPanel />
      ) : robots.isError ? (
        <ErrorPanel error={robots.error} onRetry={robots.refetch} />
      ) : data.length === 0 ? (
        <EmptyPanel>Chưa có robot nào kết nối tới hệ thống.</EmptyPanel>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
          <div className="space-y-5">
            {data.map((robot) => (
              <RobotPanel key={robot.id} robot={robot} now={now} />
            ))}
          </div>
          <div className="xl:sticky xl:top-20">
            <div className="overflow-hidden rounded-2xl border border-[#ebebe4] bg-white shadow-[0_4px_20px_-8px_rgba(28,28,28,0.16)]">
              <div className="flex items-center justify-between border-b border-[#efefe9] px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#8fbf2a] animate-pulse" />
                  <h3 className="text-sm font-bold text-[#1c1c1c]">Bản đồ vị trí hạm đội</h3>
                </div>
                <span className="text-xs text-[#6b6e75]">Tọa độ ROS thời gian thực</span>
              </div>
              <OperationalTwin robots={data} className="h-[460px]" />
            </div>
          </div>
        </div>
      )}
    </StaffPage>
  )
}

function RobotPanel({ robot, now }: { robot: AmrStatus; now: number }) {
  const confirm = useConfirmRobotReady()
  const [open, setOpen] = useState(false)
  const release = robot.needsCheck ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      disabled={robot.executionState === 'Unknown'}
      className={buttonClass('primary', 'sm')}
    >
      <CheckCheck size={14} aria-hidden="true" />
      Xác nhận sẵn sàng
    </button>
  ) : null

  return (
    <section
      className={`${panelClass} ${robot.assignable === false ? 'opacity-90' : ''}`}
      aria-label={robot.name}
    >
      <div className="border-b border-[#efefe9] px-5 py-4">
        <RobotHeader robot={robot} action={release} />
      </div>
      {robot.needsCheck && (
        <div className="mx-5 mt-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-2.5 text-xs text-[#b45309] flex items-center gap-2">
          <Wrench size={15} className="shrink-0 text-[#d97706]" />
          <span>
            Robot đang được giữ sau khi kết thúc sớm hoặc gặp sự cố.{' '}
            {robot.executionState === 'Unknown'
              ? 'Chưa có tín hiệu xác nhận robot đã dừng an toàn.'
              : 'Kiểm tra tại chỗ robot đã dừng, đầu xoay ở FRONT, sau đó bấm Xác nhận sẵn sàng.'}
          </span>
        </div>
      )}
      <div className="px-5 pb-4 pt-1">
        <RobotTelemetry robot={robot} now={now} />
      </div>
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
    </section>
  )
}

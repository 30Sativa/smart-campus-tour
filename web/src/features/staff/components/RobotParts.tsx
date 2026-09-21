import type { ReactNode } from 'react'
import { Bot, Compass, Crosshair, Gauge, MapPin, Wifi, WifiOff } from 'lucide-react'
import type { AmrStatus } from '../../../api/contracts/staff'
import { StatusBadge } from '../StaffUi'
import { HEAD_LABEL, statusInfo, type StatusTone } from '../status'
import { formatHeartbeat, formatSpeed } from '../formatters'
import { POSE_STALE_SECONDS, robotIssues } from '../attention'

const LOW_BATTERY = 20
const WATCH_BATTERY = 40

function batteryTone(value: number): StatusTone {
  return value < LOW_BATTERY ? 'danger' : value < WATCH_BATTERY ? 'warn' : 'ok'
}

const barFill: Record<StatusTone, string> = {
  ok: 'bg-[#10b981]',
  info: 'bg-[#2563eb]',
  warn: 'bg-[#f59e0b]',
  danger: 'bg-[#ef4444]',
  muted: 'bg-[#94a3b8]',
}

const textTone: Record<StatusTone, string> = {
  ok: 'text-[#16a34a]',
  info: 'text-[#2563eb]',
  warn: 'text-[#d97706]',
  danger: 'text-[#dc2626]',
  muted: 'text-[#64748b]',
}

/** Battery as a bar and a number - only when the robot measures it (scope §8.4). */
export function BatteryMeter({ value }: { value?: number | null }) {
  if (value == null) return <span className="text-xs font-medium text-[#94a3b8]">Không đo</span>
  const tone = batteryTone(value)
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        role="meter"
        aria-label="Mức pin"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        className="relative h-2 w-full min-w-16 flex-1 overflow-hidden rounded-full bg-[#f1f5f9]"
      >
        <span
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out ${barFill[tone]}`}
          style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        />
      </span>
      <span className={`shrink-0 text-xs font-bold tabular-nums ${textTone[tone]}`}>{Math.round(value)}%</span>
    </span>
  )
}

/** Physical / Gazebo / Emulator. Data that is not from the real robot always says so. */
export function SourceBadge({ source }: { source?: string }) {
  if (!source) return null
  return <StatusBadge value={source} />
}

/**
 * The live readings for one robot. Pose freshness is shown separately from
 * the heartbeat: a robot can be connected while its position is too old to
 * trust (scope §11.4).
 */
export function RobotTelemetry({ robot, now }: { robot: AmrStatus; now: number }) {
  const stale = robot.poseAgeSeconds != null && robot.poseAgeSeconds > POSE_STALE_SECONDS
  const connection = statusInfo(robot.connectionState)
  const rows: Array<{ label: string; value: ReactNode }> = [
    { label: 'Nguồn dữ liệu', value: <SourceBadge source={robot.source} /> },
    {
      label: 'Kết nối',
      value: (
        <span className={`inline-flex items-center gap-1.5 font-bold ${textTone[connection.tone]}`}>
          {robot.connectionState === 'Disconnected' ? (
            <WifiOff size={13} aria-hidden="true" />
          ) : (
            <Wifi size={13} aria-hidden="true" />
          )}
          {connection.label} · {formatHeartbeat(robot.telemetryAgeSeconds, robot.lastSeenAt, now)}
        </span>
      ),
    },
    { label: 'Thực thi', value: <StatusBadge value={robot.executionState ?? robot.operationalState} /> },
    {
      label: 'Định vị',
      value:
        robot.localized == null ? (
          'Không có dữ liệu'
        ) : robot.localized ? (
          <span className="font-semibold text-[#16a34a]">Đã định vị</span>
        ) : (
          <span className="font-bold text-[#dc2626]">Chưa định vị</span>
        ),
    },
    {
      label: 'Vị trí',
      value: robot.pose ? (
        <span className={stale ? 'font-bold text-[#d97706]' : 'font-semibold text-[#0f172a]'}>
          {robot.currentPoi ?? `${robot.pose.x.toFixed(1)}, ${robot.pose.y.toFixed(1)} m`}
          {robot.poseAgeSeconds != null && (
            <span className="ml-1 font-normal text-[#94a3b8]">
              · mẫu {robot.poseAgeSeconds}s trước{stale ? ' (cũ)' : ''}
            </span>
          )}
        </span>
      ) : (
        'Không có dữ liệu'
      ),
    },
    { label: 'Tốc độ', value: formatSpeed(robot.speedMps) },
    {
      label: 'Đầu xoay',
      value: robot.headFault ? (
        <span className="font-bold text-[#dc2626]">Lỗi · lệnh cuối {robot.headPreset ?? '—'}</span>
      ) : robot.headPreset ? (
        `${robot.headPreset} · ${HEAD_LABEL[robot.headPreset]}`
      ) : (
        'Không có dữ liệu'
      ),
    },
    {
      label: 'Pin',
      value: (
        <span className="w-32">
          <BatteryMeter value={robot.batteryPercent} />
        </span>
      ),
    },
  ]
  return (
    <dl className="divide-y divide-[#f1f5f9]">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
          <dt className="shrink-0 text-xs font-semibold text-[#64748b]">{row.label}</dt>
          <dd className="flex min-w-0 justify-end text-right text-xs font-semibold text-[#0f172a]">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Robot heading line used in panels: name, source, what it is doing, open issues. */
export function RobotHeader({ robot, action }: { robot: AmrStatus; action?: ReactNode }) {
  const issues = robotIssues(robot)
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${
            issues.length ? 'bg-[#fffbeb] text-[#d97706]' : 'bg-[#eff6ff] text-[#2563eb]'
          }`}
          aria-hidden="true"
        >
          <Bot size={20} strokeWidth={2} />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[16px] font-extrabold text-[#0f172a]">{robot.name}</span>
            <SourceBadge source={robot.source} />
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#64748b]">
            <span className="inline-flex items-center gap-1">
              <Crosshair size={12} aria-hidden="true" />
              {robot.currentTourCode
                ? `Đang phục vụ ${robot.currentTourCode}`
                : robot.assignable === false
                ? 'Chỉ dùng diễn tập / nghiên cứu'
                : 'Không phục vụ buổi nào'}
            </span>
            {robot.currentPoi && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} aria-hidden="true" />
                {robot.currentPoi}
              </span>
            )}
            {robot.headPreset && (
              <span className="inline-flex items-center gap-1">
                <Compass size={12} aria-hidden="true" />
                Đầu {robot.headPreset}
              </span>
            )}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        {issues.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fde68a] bg-[#fffbeb] px-2.5 py-0.5 text-[11px] font-bold text-[#d97706]">
            <Gauge size={12} aria-hidden="true" />
            {issues.join(' · ')}
          </span>
        ) : (
          <StatusBadge value="Healthy" />
        )}
        {action}
      </div>
    </div>
  )
}

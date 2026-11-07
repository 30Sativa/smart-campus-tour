import type { StatusTone } from '../../components/ui/status-tone'

/**
 * How much a robot-reported reading can be trusted, which is a separate question from what it says.
 * Fleet Sync (connection, battery, pose) and the Mini PC diagnostics report arrive on two independent
 * channels, and the backend keeps only the latest of each in memory, so each gets its own source state:
 * - LIVE: received inside the backend's freshness window.
 * - STALE: a report exists but is older than the window; its values are the last known, not now.
 * - UNAVAILABLE: no report since the backend last started (or ever); there is nothing to show.
 */
export type SourceState = 'LIVE' | 'STALE' | 'UNAVAILABLE'

export const sourceState = (hasReport: boolean, fresh: boolean): SourceState =>
  !hasReport ? 'UNAVAILABLE' : fresh ? 'LIVE' : 'STALE'

export const sourceStateView: Record<SourceState, { label: string; tone: StatusTone }> = {
  LIVE: { label: 'Đang cập nhật', tone: 'ok' },
  STALE: { label: 'Dữ liệu cũ', tone: 'warn' },
  UNAVAILABLE: { label: 'Chưa có dữ liệu', tone: 'muted' },
}

/** Fleet Sync connection (backend-derived). DISCONNECTED is the offline case. */
const connectionView: Record<string, { label: string; tone: StatusTone }> = {
  CONNECTED: { label: 'Trực tuyến', tone: 'ok' },
  DISCONNECTED: { label: 'Ngoại tuyến', tone: 'danger' },
  AWAITING_DATA: { label: 'Chưa nhận dữ liệu', tone: 'warn' },
  UNCONFIRMED: { label: 'Chưa xác nhận kết nối', tone: 'muted' },
}

export const connectionStatusView = (status: string) => connectionView[status] ?? { label: 'Không xác định', tone: 'muted' as StatusTone }

/** Sensor states as the robot reports them. NOT_EQUIPPED is "not applicable", never a fault. */
const sensorView: Record<string, { label: string; tone: StatusTone }> = {
  OK: { label: 'Bình thường', tone: 'ok' },
  WARN: { label: 'Cảnh báo', tone: 'warn' },
  ERROR: { label: 'Lỗi', tone: 'danger' },
  STALE: { label: 'Dữ liệu cũ', tone: 'warn' },
  UNKNOWN: { label: 'Không xác định', tone: 'muted' },
  NOT_EQUIPPED: { label: 'Không trang bị', tone: 'muted' },
}

export const sensorStatusView = (status: string | null | undefined) =>
  status ? sensorView[status] ?? { label: 'Không xác định', tone: 'muted' as StatusTone } : { label: 'Không xác định', tone: 'muted' as StatusTone }

const middlewareView: Record<string, { label: string; tone: StatusTone }> = {
  OK: { label: 'Bình thường', tone: 'ok' },
  DEGRADED: { label: 'Suy giảm', tone: 'warn' },
  ERROR: { label: 'Lỗi', tone: 'danger' },
}

export const middlewareStatusView = (status: string) => middlewareView[status] ?? { label: 'Không xác định', tone: 'muted' as StatusTone }

const nodeView: Record<string, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: 'Đang chạy', tone: 'ok' },
  INACTIVE: { label: 'Không hoạt động', tone: 'warn' },
  UNRESPONSIVE: { label: 'Không phản hồi', tone: 'danger' },
}

export const nodeStatusView = (state: string) => nodeView[state] ?? { label: 'Không xác định', tone: 'muted' as StatusTone }

const nav2View: Record<string, string> = {
  IDLE: 'Đang chờ',
  NAVIGATING: 'Đang di chuyển',
  ARRIVED: 'Đã đến đích',
  FAILED: 'Thất bại',
  UNKNOWN: 'Không xác định',
}

export const nav2StateLabel = (state: string | null) => (state ? nav2View[state] ?? 'Không xác định' : 'Không xác định')

/** A yes/no reading that may be missing: null is "unknown", not "no". */
export const flagLabel = (value: boolean | null | undefined, yes: string, no: string) =>
  value === null || value === undefined ? 'Không xác định' : value ? yes : no

/**
 * One numeric reading. `null` inside a received report means the collector could not measure it, which
 * is different from having no report at all; the caller decides which applies before calling this.
 */
export const reading = (value: number | null | undefined, unit: string, digits = 0) =>
  value === null || value === undefined || Number.isNaN(value) ? 'Không đo được' : `${value.toFixed(digits)}${unit}`

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes) || bytes < 0) return '-'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${parseFloat((bytes / 1024 ** index).toFixed(1))} ${units[index]}`
}

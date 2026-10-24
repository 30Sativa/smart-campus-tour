/**
 * The Meta Quest 3 headset as quest-stream reports it on the robot miniPC
 * (`GET http://<NUC>:8080/device`, robot/quest-stream/server.py): the adb
 * connection and battery of the headset, kept apart from the video stream.
 *
 * Everything here is pure (no React, no fetch state) so the dashboard card
 * and the tests read the same rules.
 */

export type QuestConnection = 'connected' | 'unauthorized' | 'offline' | 'not_found' | 'adb_error' | 'unknown'
export type QuestStream = 'live' | 'connecting' | 'lost'
export type QuestTone = 'ok' | 'info' | 'warn' | 'danger' | 'muted'

export type QuestBattery = {
  /** Percent 0-100. */
  level: number
  charging: boolean
  /** Power source when plugged in: AC, USB or Wireless. */
  plugged: string | null
  /** charging | discharging | not_charging | full | unknown */
  status: string
}

/** The `/device` body. Times are epoch seconds from the miniPC clock. */
export type QuestDevice = {
  connection: QuestConnection
  reason: string
  serial: string
  model: string
  battery: QuestBattery | null
  batteryError: string | null
  checkedAt: number | null
  stream: QuestStream
  streamState: string
  streamReason: string
  pollSeconds: number
  now: number
}

/** Below this the card warns (requirement: pin dưới 20%). */
export const QUEST_LOW_BATTERY = 20
/** A headset reading older than this (miniPC clock) is shown as stale. */
export const QUEST_STALE_SECONDS = 15
/** How often the dashboard asks the miniPC. */
export const QUEST_REFRESH_MS = 5_000

/** `http://<NUC>:8080` or `.../device` -> the `/device` URL; anything else -> null. */
export function resolveDeviceUrl(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = /\/device$/i.test(path) ? path : `${path}/device`
  return url.toString()
}

const CONNECTIONS: QuestConnection[] = ['connected', 'unauthorized', 'offline', 'not_found', 'adb_error', 'unknown']
const STREAMS: QuestStream[] = ['live', 'connecting', 'lost']

/** Reads `/device`; rejects on network errors, HTTP errors and malformed bodies. */
export async function fetchQuestDevice(url: string, signal?: AbortSignal): Promise<QuestDevice> {
  const response = await fetch(url, { signal, cache: 'no-store', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`quest-stream /device trả về HTTP ${response.status}`)
  const body = (await response.json()) as Partial<QuestDevice>
  if (!body || !CONNECTIONS.includes(body.connection as QuestConnection) || !STREAMS.includes(body.stream as QuestStream)) {
    throw new Error('quest-stream /device trả về dữ liệu không đúng định dạng')
  }
  return {
    connection: body.connection as QuestConnection,
    reason: body.reason ?? '',
    serial: body.serial ?? '',
    model: body.model ?? '',
    battery: body.battery ?? null,
    batteryError: body.batteryError ?? null,
    checkedAt: typeof body.checkedAt === 'number' ? body.checkedAt : null,
    stream: body.stream as QuestStream,
    streamState: body.streamState ?? '',
    streamReason: body.streamReason ?? '',
    pollSeconds: typeof body.pollSeconds === 'number' ? body.pollSeconds : 5,
    now: typeof body.now === 'number' ? body.now : Date.now() / 1000,
  }
}

export const CONNECTION_VIEW: Record<QuestConnection, { label: string; tone: QuestTone; hint: string }> = {
  connected: { label: 'Đã kết nối', tone: 'ok', hint: 'USB · ADB sẵn sàng' },
  unauthorized: { label: 'Chưa cấp quyền ADB', tone: 'warn', hint: 'Kính đã cắm nhưng chưa cho phép gỡ lỗi USB' },
  offline: { label: 'Mất kết nối', tone: 'danger', hint: 'ADB báo thiết bị offline' },
  not_found: { label: 'Mất kết nối', tone: 'danger', hint: 'MiniPC không thấy kính qua USB' },
  adb_error: { label: 'Lỗi ADB', tone: 'danger', hint: 'MiniPC không chạy được adb' },
  unknown: { label: 'Đang kiểm tra', tone: 'muted', hint: 'Chưa có lần đọc kính nào' },
}

export const STREAM_VIEW: Record<QuestStream, { label: string; tone: QuestTone }> = {
  live: { label: 'Đang phát', tone: 'ok' },
  connecting: { label: 'Đang kết nối', tone: 'info' },
  lost: { label: 'Mất tín hiệu', tone: 'danger' },
}

export type QuestAlert = { tone: 'warn' | 'danger'; title: string; hint: string }

export type QuestView = {
  /** Seconds since the miniPC last read the headset (miniPC clock), or null before the first read. */
  ageSeconds: number | null
  stale: boolean
  alerts: QuestAlert[]
  /** Worst of the alerts: what the card header says. */
  overall: { label: string; tone: QuestTone }
}

/** What the card should say about one `/device` reading. */
export function questDeviceView(device: QuestDevice): QuestView {
  const ageSeconds = device.checkedAt == null ? null : Math.max(0, Math.round(device.now - device.checkedAt))
  const stale = ageSeconds != null && ageSeconds > QUEST_STALE_SECONDS
  const alerts: QuestAlert[] = []
  switch (device.connection) {
    case 'unauthorized':
      alerts.push({ tone: 'warn', title: 'Kính chưa cấp quyền ADB.', hint: 'Đeo kính lên và chọn "Allow USB debugging" (nên chọn "Always allow").' })
      break
    case 'offline':
    case 'not_found':
      alerts.push({ tone: 'danger', title: 'Mất kết nối với kính.', hint: 'Kiểm tra cáp USB-C giữa kính và miniPC, và kính đang bật.' })
      break
    case 'adb_error':
      alerts.push({ tone: 'danger', title: 'MiniPC không đọc được kính qua ADB.', hint: device.reason || 'Kiểm tra adb trên miniPC: adb devices -l' })
      break
  }
  if (device.battery && device.battery.level < QUEST_LOW_BATTERY) {
    alerts.push({
      tone: 'danger',
      title: `Pin kính còn ${Math.round(device.battery.level)}%.`,
      hint: device.battery.charging ? 'Kính đang sạc.' : 'Cắm sạc kính trước buổi kế tiếp.',
    })
  }
  if (device.connection === 'connected' && device.stream === 'lost') {
    alerts.push({ tone: 'danger', title: 'Livestream bị gián đoạn.', hint: 'Kính vẫn kết nối nhưng không có hình; thường do kính ngủ. Bấm nút nguồn kính một lần để đánh thức.' })
  }
  if (stale) {
    alerts.push({ tone: 'warn', title: 'Dữ liệu kính đã cũ.', hint: `Lần đọc kính gần nhất cách đây ${ageSeconds} giây; các giá trị có thể không còn đúng.` })
  }
  const overall = alerts.some((alert) => alert.tone === 'danger')
    ? { label: 'Cần xử lý', tone: 'danger' as const }
    : alerts.length
    ? { label: 'Cần chú ý', tone: 'warn' as const }
    : device.connection === 'unknown'
    ? { label: 'Đang kiểm tra', tone: 'muted' as const }
    : { label: 'Bình thường', tone: 'ok' as const }
  return { ageSeconds, stale, alerts, overall }
}

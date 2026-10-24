import { useId, useState, type ReactNode } from 'react'
import { BatteryCharging, ChevronDown, Glasses, Plug, RotateCcw, TriangleAlert } from 'lucide-react'
import { toneClass, type StatusTone } from '../../../components/ui/status-tone'
import { panelClass } from '../../../components/ui/ConsolePrimitives'
import { LiveDot } from '../StaffUi'
import { BatteryMeter } from './RobotParts'
import { useQuestDevice } from '../../quest-stream/use-quest-device'
import {
  CONNECTION_VIEW,
  QUEST_REFRESH_MS,
  STREAM_VIEW,
  questDeviceView,
  type QuestAlert,
} from '../../quest-stream/quest-device'

const TONE_TEXT: Record<StatusTone, string> = {
  ok: 'text-[#16a34a]',
  info: 'text-[#2563eb]',
  warn: 'text-[#d97706]',
  danger: 'text-[#dc2626]',
  muted: 'text-[#64748b]',
}

/**
 * A compact device card for the side rail of Robot & thiết bị: name, the few
 * readings that matter at a glance, and a "Xem chi tiết" toggle that opens the
 * full readings in place.
 */
export function DeviceCard({
  label,
  icon,
  title,
  tag,
  badge,
  children,
  details,
  footer,
}: {
  label: string
  icon: ReactNode
  title: ReactNode
  tag?: ReactNode
  badge?: ReactNode
  children: ReactNode
  details?: ReactNode
  footer: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <section className={`${panelClass} flex min-w-0 flex-col`} aria-label={label}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eff6ff] text-[#2563eb]" aria-hidden="true">
            {icon}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-extrabold text-[#0f172a]">{title}</span>
            {tag && <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-[#64748b]">{tag}</span>}
          </span>
        </div>
        {badge && <span className="shrink-0">{badge}</span>}
      </div>

      <div className="space-y-3 px-4 pt-3 pb-3.5">{children}</div>

      {details && (
        <div
          id={id}
          inert={!open}
          className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="border-t border-[#f1f5f9] px-4 pt-1 pb-3">{details}</div>
          </div>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#f1f5f9] px-4 py-2 text-[11.5px] text-[#64748b]">
        <span className="flex min-w-0 items-center gap-1.5 truncate">{footer}</span>
        {details && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-[#2563eb] transition-colors hover:bg-[#eff6ff]"
          >
            {open ? 'Thu gọn' : 'Xem chi tiết'}
            <ChevronDown size={14} aria-hidden="true" className={`transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
    </section>
  )
}

/** One glanceable reading: a small caption over its value. */
export function Stat({ label, tone, children }: { label: string; tone?: StatusTone; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10.5px] font-bold uppercase tracking-wide text-[#94a3b8]">{label}</span>
      <span className={`mt-1 flex min-h-5 min-w-0 items-center gap-1.5 text-xs font-bold ${tone ? TONE_TEXT[tone] : 'text-[#0f172a]'}`}>{children}</span>
    </div>
  )
}

function Pill({ tone, children, live = false }: { tone: StatusTone; children: ReactNode; live?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${toneClass[tone]}`}>
      <LiveDot tone={tone} pulse={live} />
      {children}
    </span>
  )
}

function Rows({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="divide-y divide-[#f1f5f9]">
      {rows.map((row) => (
        <div key={row.label} className="flex min-h-[38px] items-center justify-between gap-4 py-2">
          <dt className="shrink-0 text-xs font-semibold text-[#64748b]">{row.label}</dt>
          <dd className="flex min-w-0 items-center justify-end gap-1.5 text-right text-xs font-semibold text-[#0f172a]">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ── Meta Quest 3 ─────────────────────────────────────────────────────────── */

/** Alert titles at a glance; `withHints` adds what to do about each. */
function Alerts({ alerts, withHints = false }: { alerts: QuestAlert[]; withHints?: boolean }) {
  if (!alerts.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      {alerts.map((alert) => (
        <p
          key={alert.title}
          role={withHints ? undefined : alert.tone === 'danger' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11.5px] leading-relaxed ${toneClass[alert.tone]}`}
        >
          <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <b className="font-bold">{alert.title}</b>
            {withHints && <span className="text-[#334155]"> {alert.hint}</span>}
          </span>
        </p>
      ))}
    </div>
  )
}

const clock = (epochSeconds: number) =>
  new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(epochSeconds * 1000))

const BATTERY_STATUS: Record<string, string> = {
  charging: 'Đang sạc',
  discharging: 'Đang dùng pin',
  not_charging: 'Cắm nguồn nhưng không sạc',
  full: 'Đầy pin',
  unknown: 'Không rõ',
}

const SOURCE = 'Nguồn: miniPC (ADB)'
const QUEST_TITLE = 'Meta Quest 3'
const QUEST_TAG = <span>Kính · gắn trên đầu xoay robot</span>
const QUEST_ICON = <Glasses size={18} strokeWidth={2} />

/**
 * The headset as the robot miniPC sees it (adb + dumpsys battery, through
 * quest-stream `/device`). The headset connection and the livestream are
 * separate readings: a connected headset can still have no picture.
 */
export function QuestMonitor() {
  const quest = useQuestDevice()
  const retry = (
    <button
      type="button"
      onClick={() => void quest.refetch()}
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-[#2563eb] transition-colors hover:bg-[#eff6ff]"
    >
      <RotateCcw size={12} aria-hidden="true" />
      Thử lại
    </button>
  )
  const apiAlert: QuestAlert = {
    tone: 'warn',
    title: 'Không đọc được trạng thái kính từ miniPC.',
    hint: 'Dịch vụ quest-stream không phản hồi. Kiểm tra: sudo systemctl status quest-stream',
  }

  if (!quest.configured) {
    return (
      <DeviceCard
        label="Giám sát Meta Quest 3"
        icon={QUEST_ICON}
        title={QUEST_TITLE}
        tag={QUEST_TAG}
        badge={<Pill tone="muted">Chưa cấu hình</Pill>}
        footer={SOURCE}
        details={
          <p className="pt-2 text-xs leading-relaxed text-[#64748b]">
            Đặt <code className="font-mono text-[#0f172a]">VITE_QUEST_STATUS_URL=http://&lt;IP miniPC&gt;:8080</code> trong{' '}
            <code className="font-mono">web/.env.local</code> rồi khởi động lại trang.
          </p>
        }
      >
        <p className="text-xs text-[#64748b]">Chưa có địa chỉ giám sát kính trên miniPC.</p>
      </DeviceCard>
    )
  }

  if (quest.isPending) {
    return (
      <DeviceCard label="Giám sát Meta Quest 3" icon={QUEST_ICON} title={QUEST_TITLE} tag={QUEST_TAG} badge={<Pill tone="muted">Đang tải…</Pill>} footer="Đang đọc trạng thái từ miniPC…">
        <div className="grid grid-cols-2 gap-3" aria-busy="true">
          {['Kết nối kính', 'Livestream', 'Pin', 'Sạc'].map((label) => (
            <Stat key={label} label={label}>
              <span className="h-3 w-20 animate-pulse rounded bg-[#eef2f6] motion-reduce:animate-none" />
            </Stat>
          ))}
        </div>
      </DeviceCard>
    )
  }

  if (!quest.data) {
    return (
      <DeviceCard
        label="Giám sát Meta Quest 3"
        icon={QUEST_ICON}
        title={QUEST_TITLE}
        tag={QUEST_TAG}
        badge={<Pill tone="muted">Không rõ</Pill>}
        footer={<>{retry}<span>Chưa đọc được lần nào</span></>}
        details={<div className="pt-2"><Alerts alerts={[apiAlert]} withHints /></div>}
      >
        <Alerts alerts={[apiAlert]} />
        <div className="grid grid-cols-2 gap-3">
          {['Kết nối kính', 'Livestream', 'Pin', 'Sạc'].map((label) => (
            <Stat key={label} label={label}><span className="font-normal text-[#94a3b8]">Không có dữ liệu</span></Stat>
          ))}
        </div>
      </DeviceCard>
    )
  }

  const device = quest.data
  const view = questDeviceView(device)
  const failing = quest.isError
  const alerts = failing ? [apiAlert, ...view.alerts] : view.alerts
  const overall = failing && view.overall.tone !== 'danger' ? { label: 'Không rõ', tone: 'muted' as const } : view.overall
  const connection = CONNECTION_VIEW[device.connection]
  const stream = STREAM_VIEW[device.stream]
  const battery = device.battery
  const dim = failing || view.stale ? 'opacity-60' : ''
  const age = device.checkedAt == null ? 'Chưa đọc kính lần nào' : view.ageSeconds === 0 ? 'Cập nhật vừa xong' : `Cập nhật ${view.ageSeconds} giây trước`

  const charging = !battery ? (
    <span className="font-normal text-[#94a3b8]">—</span>
  ) : battery.charging ? (
    <span className="inline-flex items-center gap-1 text-[#16a34a]"><BatteryCharging size={14} aria-hidden="true" />Đang sạc</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[#64748b]"><Plug size={13} aria-hidden="true" />Không sạc</span>
  )

  const details = (
    <>
      {alerts.length > 0 && <div className="pt-3 pb-1"><Alerts alerts={alerts} withHints /></div>}
      <Rows
        rows={[
          { label: 'Thiết bị', value: <span>{device.model || QUEST_TITLE}{device.serial && <span className="ml-1 font-mono text-[11px] font-normal text-[#94a3b8]">{device.serial}</span>}</span> },
          { label: 'Kết nối ADB', value: <span><span className={TONE_TEXT[connection.tone]}>{connection.label}</span><span className="font-normal text-[#94a3b8]"> · {connection.hint}</span></span> },
          { label: 'Livestream', value: <span>{stream.label}{device.streamReason && <span className="font-normal text-[#94a3b8]"> · {device.streamReason}</span>}</span> },
          { label: 'Trạng thái pin', value: battery ? `${Math.round(battery.level)}% · ${BATTERY_STATUS[battery.status] ?? battery.status}` : <span className="font-normal text-[#94a3b8]">{device.batteryError || 'Không có dữ liệu'}</span> },
          { label: 'Nguồn sạc', value: battery?.plugged ?? <span className="font-normal text-[#94a3b8]">Không cắm</span> },
          { label: 'Lần đọc kính', value: device.checkedAt == null ? <span className="font-normal text-[#94a3b8]">Chưa có</span> : clock(device.checkedAt) },
          { label: 'Chu kỳ', value: `miniPC đọc mỗi ${device.pollSeconds} giây · trang hỏi mỗi ${QUEST_REFRESH_MS / 1000} giây` },
        ]}
      />
    </>
  )

  return (
    <DeviceCard
      label="Giám sát Meta Quest 3"
      icon={QUEST_ICON}
      title={device.model || QUEST_TITLE}
      tag={QUEST_TAG}
      badge={<Pill tone={overall.tone} live={overall.tone === 'ok'}>{overall.label}</Pill>}
      details={details}
      footer={
        failing ? (
          retry
        ) : (
          <>
            <LiveDot tone={view.stale ? 'warn' : 'ok'} pulse={false} />
            <span className="truncate">{age}</span>
          </>
        )
      }
    >
      {alerts.length > 0 && <Alerts alerts={alerts} />}
      <div className={`grid grid-cols-2 gap-3 transition-opacity ${dim}`}>
        <Stat label="Kết nối kính" tone={connection.tone}>{connection.label}</Stat>
        <Stat label="Livestream"><Pill tone={stream.tone} live={device.stream === 'live'}>{stream.label}</Pill></Stat>
        <Stat label="Pin">
          {battery ? <span className="w-full"><BatteryMeter value={battery.level} /></span> : <span className="font-normal text-[#94a3b8]">Không có dữ liệu</span>}
        </Stat>
        <Stat label="Sạc">{charging}</Stat>
      </div>
    </DeviceCard>
  )
}

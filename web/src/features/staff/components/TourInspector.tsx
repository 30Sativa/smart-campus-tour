import { useState, type ReactNode, type Ref } from 'react'
import { ArrowRight, Clock, MapPin, TriangleAlert, X } from 'lucide-react'
import { Link } from 'react-router'
import type { TourOperation } from '../../../api/contracts/staff'
import { buttonClass } from '../../../components/ui/ui-classes'
import { groupSummary, routeProgress, tourAction } from '../attention'
import { formatCountdown, formatDuration, formatTime } from '../formatters'
import { REASON_SHORT } from '../reason'
import { stepLabel } from '../status'
import { useTour } from '../staff-hooks'
import { tourColor } from '../today-board'
import { TourEventLog } from './TourEventLog'
import { RegistrationList, StartChecklist, TourStateBadges } from './TourParts'
import { TourTimeline } from './TourTimeline'

type Tab = 'overview' | 'groups' | 'route' | 'log'

const STREAM_LABEL: Record<string, string> = { Live: 'Đang phát', Connecting: 'Đang kết nối', Offline: 'Mất tín hiệu' }

/**
 * The selected Tour beside the day board: its next step, what holds it back,
 * and its groups, route and log in tabs. On a wide screen it sits beside the
 * list; below that it slides in from the right over the page.
 */
export function TourInspector({ tour, now, open, wide, onClose, panelRef }: {
  tour?: TourOperation
  now: number
  /** Below xl: whether the panel is slid in. */
  open: boolean
  /** At xl and up the panel is always shown beside the list. */
  wide: boolean
  onClose: () => void
  panelRef?: Ref<HTMLElement>
}) {
  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-[#0f172a]/40 transition-opacity duration-300 xl:hidden motion-reduce:transition-none ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        aria-label="Chi tiết buổi"
        inert={!wide && !open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col overflow-hidden bg-white shadow-2xl transition-transform duration-300 ease-out outline-none motion-reduce:transition-none sm:rounded-l-2xl xl:sticky xl:inset-auto xl:top-6 xl:z-auto xl:max-h-[calc(100vh-3rem)] xl:w-auto xl:max-w-none xl:translate-x-0 xl:rounded-[18px] xl:border xl:border-[var(--ops-border,#d9e9f5)] xl:shadow-[0_12px_32px_-30px_#285c7d] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {tour ? (
          <InspectorBody key={tour.id} tour={tour} now={now} onClose={onClose} />
        ) : (
          <div className="grid flex-1 place-content-center gap-1.5 px-8 py-16 text-center text-sm text-[#64748b]">
            <b className="text-[15px] text-[#0f172a]">Chọn một buổi</b>
            Bấm vào buổi trong danh sách hoặc trên dải thời gian để xem đoàn, lộ trình và nhật ký.
          </div>
        )}
      </aside>
    </>
  )
}

function InspectorBody({ tour, now, onClose }: { tour: TourOperation; now: number; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview')
  const action = tourAction(tour)
  const detail = `/staff/tours/${tour.id}`
  const upcoming = tour.state === 'Scheduled' || tour.state === 'Ready'
  const countdown = upcoming ? formatCountdown(tour.scheduledAt, now) : null
  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: 'overview', label: 'Tổng quan' },
    { key: 'groups', label: 'Đoàn', count: tour.registrations.length },
    { key: 'route', label: 'Lộ trình', count: tour.stops.length },
    { key: 'log', label: 'Nhật ký' },
  ]

  return (
    <>
      <span aria-hidden="true" className="h-1.5 shrink-0" style={{ background: tourColor(tour) }} />
      <div className="relative px-5 pt-4 pb-3">
        <button type="button" onClick={onClose} aria-label="Đóng chi tiết" className="absolute top-3 right-3 grid size-9 place-items-center rounded-lg border border-[#e6ebf1] text-[#64748b] transition-colors hover:bg-[#f8fafc] hover:text-[#0f172a] xl:hidden">
          <X size={16} aria-hidden="true" />
        </button>
        <span className="flex flex-wrap items-center gap-1.5 pr-10 xl:pr-0">
          <span className="rounded-md bg-[#eff6ff] px-1.5 py-px font-mono text-[11.5px] font-bold text-[#2563eb]">{tour.code}</span>
          <TourStateBadges tour={tour} />
        </span>
        <h2 className="mt-2 text-xl leading-snug font-extrabold tracking-tight text-[#0f172a]">{tour.name}</h2>
        <p className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] text-[#64748b]">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={13} aria-hidden="true" />
            {formatTime(tour.scheduledAt)} – {formatTime(tour.endedAt ?? tour.estimatedEndAt)}
            {countdown ? ` · ${countdown}` : ''}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={13} aria-hidden="true" />
            {tour.routeName}
          </span>
        </p>
      </div>

      <div className="flex gap-2 px-5 pb-3">
        <Link to={action.to} className={`${buttonClass(action.kind === 'primary' || tour.state === 'Running' ? 'primary' : 'secondary', 'md')} flex-1`}>
          {action.label}
        </Link>
        {action.to !== detail && (
          <Link to={detail} className={buttonClass('secondary', 'md')}>
            Trang chi tiết
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        )}
      </div>

      <Notice tour={tour} />

      <div role="tablist" aria-label="Thông tin buổi" className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#e6ebf1] px-3.5">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`relative inline-flex shrink-0 items-center gap-1.5 px-2.5 pt-2.5 pb-3 text-[13px] font-bold transition-colors ${tab === item.key ? 'text-[#0f172a]' : 'text-[#64748b] hover:text-[#0f172a]'}`}
          >
            {item.label}
            {item.count != null && (
              <span className={`rounded-full px-1.5 text-[10.5px] font-extrabold tabular-nums ${tab === item.key ? 'bg-[#0f172a] text-white' : 'bg-[#f1f5f9] text-[#64748b]'}`}>{item.count}</span>
            )}
            <span aria-hidden="true" className={`absolute inset-x-2.5 -bottom-px h-0.5 rounded-full bg-[#0f172a] transition-transform duration-200 motion-reduce:transition-none ${tab === item.key ? 'scale-x-100' : 'scale-x-0'}`} />
          </button>
        ))}
      </div>

      <div key={tab} role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-6 transition-[opacity,translate] duration-300 starting:translate-y-1.5 starting:opacity-0 motion-reduce:transition-none">
        {tab === 'overview' ? (
          <Overview tour={tour} now={now} />
        ) : tab === 'groups' ? (
          <>
            <RegistrationList registrations={tour.registrations} />
            <p className="mt-4 text-[11.5px] text-[#94a3b8]">Admin duyệt và gửi thông tin tham gia; Staff chỉ theo dõi.</p>
          </>
        ) : tab === 'route' ? (
          <TourTimeline tour={tour} />
        ) : (
          <Log tourId={tour.id} />
        )}
      </div>
    </>
  )
}

/** What holds the Tour back, or how it ended, in one box above the tabs. */
function Notice({ tour }: { tour: TourOperation }) {
  let tone: 'warn' | 'danger' | 'ok' | null = null
  let body: ReactNode = null
  if (tour.state === 'Running' && tour.operationalStatus === 'NeedsAssistance') {
    tone = 'danger'
    body = <><b>Cần hỗ trợ{tour.reason ? ` · ${REASON_SHORT[tour.reason] ?? tour.reason}` : ''}.</b> {tour.reasonDetail ?? 'Mở điều hành để xử lý.'}</>
  } else if (tour.state === 'Scheduled' && tour.readyBlockers.length > 0) {
    tone = 'warn'
    body = <><b>Chưa sẵn sàng.</b> {tour.readyBlockers.join(' · ')}. Admin chốt buổi khi đủ điều kiện; Staff chưa cần làm gì.</>
  } else if (tour.state === 'Ready' && !tour.allowedActions.start.allowed) {
    tone = 'warn'
    body = <><b>Chưa bắt đầu được.</b> {tour.allowedActions.start.reason ?? 'Chưa đủ điều kiện kiểm tra.'}</>
  } else if (tour.state === 'Cancelled') {
    tone = 'danger'
    body = <><b>Đã hủy.</b> {tour.endReason ?? ''}</>
  } else if (tour.state === 'Completed' && tour.endReason) {
    tone = 'ok'
    body = <><b>Hoàn thành.</b> {tour.endReason}</>
  }
  if (!tone) return null
  const style = tone === 'danger' ? 'border-[#fecaca] bg-[#fef2f2] text-[#991b1b]' : tone === 'warn' ? 'border-[#fde68a] bg-[#fffbeb] text-[#92400e]' : 'border-[#a7f3d0] bg-[#ecfdf5] text-[#166534]'
  return (
    <p role={tone === 'danger' ? 'alert' : 'status'} className={`mx-5 mb-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] leading-relaxed ${style}`}>
      <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{body}</span>
    </p>
  )
}

function Fact({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 bg-white px-3 py-2.5">
      <dt className="text-[10.5px] font-bold tracking-[0.05em] text-[#94a3b8] uppercase">{label}</dt>
      <dd className={`mt-0.5 truncate text-[13.5px] font-bold text-[#0f172a] ${mono ? 'font-mono text-[12.5px]' : ''}`}>{children}</dd>
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-extrabold text-[#0f172a]">{title}</h3>
        {note && <span className="truncate text-[11.5px] text-[#94a3b8]">{note}</span>}
      </div>
      {children}
    </section>
  )
}

function Overview({ tour, now }: { tour: TourOperation; now: number }) {
  const groups = groupSummary(tour)
  const progress = routeProgress(tour)
  const lite = (text: string) => <span className="font-sans text-xs font-medium text-[#94a3b8]">{text}</span>
  const passed = tour.startChecks.filter((check) => check.passed).length
  return (
    <>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#f1f4f8] bg-[#f1f4f8]">
        <Fact label="Giờ dự kiến" mono>{formatTime(tour.scheduledAt)}</Fact>
        <Fact label="Kết thúc dự kiến" mono>{formatTime(tour.estimatedEndAt)}</Fact>
        <Fact label="Robot" mono>{tour.robotName ?? lite('Nhận khi bắt đầu')}</Fact>
        <Fact label="Ngôn ngữ">{tour.language}</Fact>
        <Fact label="Đoàn đã duyệt">{groups.groups} {lite(`/ ${tour.registrations.length} đăng ký`)}</Fact>
        <Fact label="Học sinh">{groups.students}</Fact>
        {tour.startedAt && <Fact label="Bắt đầu" mono>{formatTime(tour.startedAt)}</Fact>}
        {tour.startedAt && (
          <Fact label={tour.endedAt ? 'Kết thúc' : 'Đã chạy'} mono>
            {tour.endedAt ? <>{formatTime(tour.endedAt)} {lite(`· ${formatDuration(tour.startedAt, tour.endedAt)}`)}</> : formatDuration(tour.startedAt, new Date(now).toISOString())}
          </Fact>
        )}
      </dl>

      {tour.state === 'Running' && (
        <Section title="Đang diễn ra" note="cập nhật trực tiếp">
          <dl className="grid grid-cols-3 gap-2 max-sm:grid-cols-2">
            <div className="rounded-xl bg-[#f8fafc] px-3 py-2">
              <dt className="text-[10.5px] font-bold tracking-[0.05em] text-[#94a3b8] uppercase">POI</dt>
              <dd className="mt-0.5 text-[12.5px] font-bold text-[#0f172a]">{progress.current ? `${(tour.progress?.stopIndex ?? 0) + 1}/${progress.total} · ${progress.current.name}` : `${progress.done}/${progress.total}`}</dd>
            </div>
            <div className="rounded-xl bg-[#f8fafc] px-3 py-2">
              <dt className="text-[10.5px] font-bold tracking-[0.05em] text-[#94a3b8] uppercase">Bước</dt>
              <dd className="mt-0.5 text-[12.5px] font-bold text-[#0f172a]">{tour.progress?.step ? stepLabel(tour.progress.step) : 'Không có dữ liệu'}</dd>
            </div>
            <div className="rounded-xl bg-[#f8fafc] px-3 py-2">
              <dt className="text-[10.5px] font-bold tracking-[0.05em] text-[#94a3b8] uppercase">Livestream</dt>
              <dd className={`mt-0.5 text-[12.5px] font-bold ${tour.livestream.state === 'Live' ? 'text-[#16a34a]' : tour.livestream.state === 'Connecting' ? 'text-[#d97706]' : 'text-[#dc2626]'}`}>
                {STREAM_LABEL[tour.livestream.state] ?? tour.livestream.state}
              </dd>
            </div>
          </dl>
        </Section>
      )}

      {tour.state === 'Ready' && tour.startChecks.length > 0 && (
        <Section title="Kiểm tra trước khi bắt đầu" note={`${passed}/${tour.startChecks.length} đạt`}>
          <StartChecklist checks={tour.startChecks} />
        </Section>
      )}

      <Section title="Lộ trình" note={tour.routeName}>
        <TourTimeline tour={tour} compact />
      </Section>
    </>
  )
}

/** The log is only fetched when its tab is opened. */
function Log({ tourId }: { tourId: string }) {
  const detail = useTour(tourId)
  if (detail.isPending) return <p className="py-6 text-center text-xs text-[#94a3b8]">Đang tải nhật ký…</p>
  if (detail.isError) {
    return (
      <p className="py-6 text-center text-xs text-[#b91c1c]">
        Không tải được nhật ký.{' '}
        <button type="button" onClick={() => void detail.refetch()} className="font-bold underline">Thử lại</button>
      </p>
    )
  }
  return <TourEventLog events={detail.data.events} className="space-y-3.5" />
}

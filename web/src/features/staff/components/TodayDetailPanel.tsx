import type { ReactNode } from 'react'
import { Check, FileText, MonitorPlay, PlayCircle, TriangleAlert, Users, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import type { TourOperation } from '../../../api/contracts/staff'
import { buttonClass } from '../../../components/ui/ui-classes'
import { groupSummary, routeProgress, tourAction } from '../attention'
import { formatTime } from '../formatters'
import { REASON_SHORT } from '../reason'
import { TourStateBadges } from './TourParts'

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2'

/**
 * "Buổi hôm nay" on a wide screen: the chosen session (or the one that matters
 * now) kept beside the list as one compact card: what is wrong, four facts,
 * the route, the groups and the next step. The full tabs live on the detail page.
 */
export function TodayDetailPanel({ tour }: { tour: TourOperation }) {
  const action = tourAction(tour)
  const detail = `/staff/tours/${tour.id}`
  const groups = groupSummary(tour)
  const progress = routeProgress(tour)
  const index = tour.progress?.stopIndex
  const where = tour.state === 'Running'
    ? index != null ? `${index + 1} / ${tour.stops.length}` : 'Về điểm cuối'
    : tour.state === 'Completed' ? `${progress.done} / ${progress.total}` : `0 / ${tour.stops.length}`
  const schools = tour.registrations.filter((reg) => reg.state === 'Approved').map((reg) => reg.schoolName).filter(Boolean)

  return (
    <section role="complementary" aria-label="Chi tiết buổi" className="ct-panel sticky top-4 flex min-w-0 flex-col gap-4 rounded-[15px] bg-white p-5 shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)]">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-[#2d3748]">Chi tiết buổi</h2>
          <span className="rounded-md bg-[#f1f5f9] px-1.5 py-px font-mono text-[11.5px] font-bold text-[#475569]">{tour.code}</span>
          <span className="ml-auto"><TourStateBadges tour={tour} showReason={false} /></span>
        </div>
        <p className="mt-1 text-[15px] font-bold text-[#2d3748]">{tour.name}</p>
        <p className="text-[13px] text-[#718096]">{tour.routeName}</p>
      </header>

      <PanelNotice tour={tour} />

      <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-[#e2e8f0] text-sm">
        <Fact label="Giờ bắt đầu">{formatTime(tour.startedAt ?? tour.scheduledAt)}</Fact>
        <Fact label="Đoàn đã duyệt" right>{groups.groups} đoàn</Fact>
        <Fact label="HS đã duyệt" bottom>{groups.students}</Fact>
        <Fact label="Điểm hiện tại" right bottom>{where}</Fact>
      </dl>

      {tour.stops.length > 0 && <div>
        <h3 className="mb-1.5 text-sm font-bold text-[#2d3748]">Lộ trình</h3>
        <ol className="space-y-1">
          {tour.stops.map((stop, i) => {
            const done = stop.status === 'Completed' || stop.status === 'Skipped'
            const current = stop.status === 'Current'
            return <li key={stop.id} className={`flex items-center gap-2.5 text-[13px] ${current ? 'font-semibold text-[#2d3748]' : 'text-[#718096]'}`}>
              <span aria-hidden="true" className={`grid size-4 shrink-0 place-items-center rounded-full ${done ? 'bg-[#93b8f5] text-white' : current ? 'border-[3px] border-[#bfd6fb] bg-[#2563eb]' : 'border-[1.5px] border-[#cbd5e1] bg-white'}`}>{done && <Check size={10} strokeWidth={3.5} />}</span>
              <span className="min-w-0 truncate">{stop.name} · Điểm {i + 1}{current ? '' : done ? (stop.status === 'Skipped' ? ' · Đã bỏ qua' : ' · Đã qua') : ' · Chưa tới'}</span>
            </li>
          })}
        </ol>
      </div>}

      <div>
        <h3 className="mb-1.5 text-sm font-bold text-[#2d3748]">Đoàn tham quan</h3>
        <Link to={detail} className={`group flex items-center gap-3 rounded-xl border border-[#e2e8f0] px-3.5 py-2.5 transition-colors hover:bg-[#f8fafc] ${focus}`}>
          <span className="min-w-0 flex-1">
            {schools.length === 0 ? <span className="block text-[13px] text-[#718096]">Chưa có đoàn đăng ký</span> : schools.slice(0, 2).map((name) => (
              <span key={name} className="flex items-center gap-2 py-0.5 text-[13px] text-[#2d3748]"><Users size={14} aria-hidden="true" className="shrink-0 text-[#718096]" /><span className="truncate">{name}</span></span>
            ))}
            <span className="mt-1 block text-xs text-[#718096]">{tour.registrations.length} đoàn trong buổi{groups.pending ? `, ${groups.pending} chờ duyệt` : ''} · Mở chi tiết để xem đầy đủ</span>
          </span>
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-[#a0aec0] transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <Link to={action.to} className={`${buttonClass(action.kind === 'primary' || tour.state === 'Running' ? 'primary' : 'secondary')} w-full`}>
          {tour.state === 'Running' ? <MonitorPlay size={16} aria-hidden="true" /> : tour.state === 'Ready' ? <PlayCircle size={16} aria-hidden="true" /> : null}{action.label}
        </Link>
        {action.to !== detail && <Link to={detail} className={`${buttonClass('secondary')} w-full`}><FileText size={15} aria-hidden="true" />Chi tiết & nhật ký</Link>}
      </div>
    </section>
  )
}

function Fact({ label, children, right = false, bottom = false }: { label: string; children: ReactNode; right?: boolean; bottom?: boolean }) {
  return (
    <div className={`px-3.5 py-2.5 ${right ? 'border-l border-[#e2e8f0]' : ''} ${bottom ? 'border-t border-[#e2e8f0]' : ''}`}>
      <dt className="text-xs text-[#718096]">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-bold text-[#2d3748] tabular-nums">{children}</dd>
    </div>
  )
}

function PanelNotice({ tour }: { tour: TourOperation }) {
  let tone: 'warn' | 'danger' | null = null
  let title = ''
  let body = ''
  if (tour.state === 'Running' && tour.operationalStatus === 'NeedsAssistance') {
    tone = 'danger'
    title = tour.reason ? REASON_SHORT[tour.reason] ?? tour.reason : 'Cần hỗ trợ'
    body = tour.reasonDetail ?? 'Mở điều hành để kiểm tra và chọn thao tác phục hồi.'
  } else if (tour.state === 'Scheduled' && tour.readyBlockers.length > 0) {
    tone = 'warn'; title = 'Chưa sẵn sàng'; body = tour.readyBlockers.join(' · ')
  } else if (tour.state === 'Ready' && !tour.allowedActions.start.allowed) {
    tone = 'warn'; title = 'Chưa bắt đầu được'; body = tour.allowedActions.start.reason ?? 'Chưa đủ điều kiện kiểm tra.'
  } else if (tour.state === 'Cancelled') {
    tone = 'danger'; title = 'Đã hủy'; body = tour.endReason ?? ''
  }
  if (!tone) return null
  const style = tone === 'danger' ? 'border-[#f5c8c2] bg-[#fff4f2] text-[#2d3748] [&>svg]:text-[#c9534a]' : 'border-[#f0d89f] bg-[#fffaeb] text-[#2d3748] [&>svg]:text-[#c08a1e]'
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 ${style}`}>
      <TriangleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        {body && <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#718096]">{body}</p>}
      </div>
    </div>
  )
}

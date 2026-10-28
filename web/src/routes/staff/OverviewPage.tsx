import type { ReactNode } from 'react'
import { MonitorPlay } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import type { TourOperation } from '../../api/contracts/staff'
import { useStaffAmrs, useTours } from '../../features/staff/staff-hooks'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { LoadingPanel, PageHeader } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { Donut, KpiRow, KpiTile } from '../../components/ui/Charts'
import { buildAttentionQueue, groupSummary } from '../../features/staff/attention'
import { formatTime } from '../../features/staff/formatters'
import { useNow } from '../../features/staff/use-now'
import { TourStateBadges } from '../../features/staff/components/TourParts'
import { AttentionList } from '../../features/staff/components/AttentionList'
import { DayGantt } from '../../features/staff/components/DayGantt'
import { RunResults, StudentsThroughDay } from '../../features/staff/components/StaffCharts'
import { CARD, lastSevenDays, studentsThroughDay, todayByState } from '../../features/staff/overview-data'

/** Donut colours for today's states: green done, blue running/ready, amber still to settle. */
const STATE_COLOR: Record<string, string> = { Completed: '#1f7a55', Running: '#2d719e', Ready: '#8cc6ea', Scheduled: '#d69412', Cancelled: '#cbd5e1' }

/**
 * Staff overview, read top to bottom: what needs doing now, the day in four
 * figures, the robot's day beside today's sessions by state, then what is
 * running, students through the day and the last seven days.
 */
export default function OverviewPage() {
  const tours = useTours()
  const history = useTours({ history: true })
  const robots = useStaffAmrs()
  const now = useNow(1000)
  const navigate = useNavigate()

  const failed = [tours, robots].find((query) => query.isError)
  if (failed) return <StaffPage><ErrorPanel error={failed.error} onRetry={failed.refetch} /></StaffPage>
  if (!tours.data || !robots.data) return <StaffPage><Header /><LoadingPanel /></StaffPage>

  const running = tours.data.find((tour) => tour.state === 'Running')
  const days = lastSevenDays(tours.data, history.data ?? [], now)
  const ran = days.reduce((sum, day) => sum + day.total, 0)
  const completed = days.reduce((sum, day) => sum + day.completed, 0)
  const day = studentsThroughDay(tours.data, now)
  const joinedSeries = day.points.flatMap((point) => (point.joined != null ? [point.joined] : []))
  const pendingGroups = tours.data.reduce((sum, tour) => sum + groupSummary(tour).pending, 0)
  const byState = todayByState(tours.data)

  return (
    <StaffPage>
      <Header running={running} count={tours.data.length} runningCount={tours.data.filter((tour) => tour.state === 'Running').length} />
      <AttentionList items={buildAttentionQueue({ tours: tours.data, robots: robots.data }, now)} />

      <KpiRow label="Số liệu chính">
        <KpiTile to="/staff/history" label="Buổi đã chạy · 7 ngày" value={ran} note={`${completed} hoàn thành`} trend={days.map((d) => d.total)} />
        <KpiTile to="/staff/history" label="Tỉ lệ hoàn thành" value={ran ? `${Math.round((completed / ran) * 100)}%` : '—'} note={`${completed}/${ran} buổi`} trend={days.map((d) => d.rate ?? 0)} trendColor="#1f7a55" />
        <KpiTile to="/staff/tours" label="Học sinh hôm nay" value={day.joined} note={`/ ${day.planned} đã đăng ký`} trend={joinedSeries} />
        <KpiTile to="/staff/manage/registrations/pending" label="Đoàn chờ duyệt" value={pendingGroups} note="trong các buổi hôm nay" tone={pendingGroups ? 'warn' : 'plain'} />
      </KpiRow>

      <div className="mb-3 grid items-start gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <Panel title="Robot hôm nay" action={<Link to="/staff/schedule" className="text-xs font-semibold text-[#2d719e] hover:underline">Lịch buổi</Link>}>
          <DayGantt tours={tours.data} now={now} onSelect={(id) => navigate(`/staff/tours?tour=${id}`)} />
        </Panel>
        <Panel title="Buổi hôm nay theo trạng thái">
          <Donut label="Buổi hôm nay theo trạng thái" unit="buổi" parts={byState.map((d) => ({ label: d.label, value: d.value, color: STATE_COLOR[d.state] ?? '#cbd5e1' }))} />
        </Panel>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-3">
        <Panel title="Đang chạy">
          {running ? <RunningCard tour={running} /> : <NothingRunning tours={tours.data} />}
        </Panel>
        <StudentsThroughDay tours={tours.data} now={now} />
        <RunResults days={days} />
      </div>
    </StaffPage>
  )
}

function Header({ running, count, runningCount }: { running?: TourOperation; count?: number; runningCount?: number }) {
  const today = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return (
    <PageHeader
      eyebrow={`${today.charAt(0).toUpperCase()}${today.slice(1)}`}
      title="Tổng quan vận hành"
      description={count != null ? `${count} buổi hôm nay, ${runningCount} đang chạy. Luồng bình thường tự chạy, Staff can thiệp khi cần.` : 'Luồng bình thường tự chạy, Staff can thiệp khi cần.'}
      action={
        <>
          <Link to="/staff/schedule" className={buttonClass('secondary')}>Lịch buổi</Link>
          <Link to={running ? `/staff/live/${running.id}` : '/staff/live'} className={buttonClass('primary')}>
            <MonitorPlay size={15} aria-hidden="true" />
            Điều hành trực tiếp
          </Link>
        </>
      }
    />
  )
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={CARD} aria-label={title}>
      <div className="flex items-center justify-between gap-2 border-b border-[#eef1f4] px-3.5 py-2.5">
        <h2 className="text-[13px] font-semibold text-[#0f172a]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** The session running now: who, where on the route, and the way into its control. */
function RunningCard({ tour }: { tour: TourOperation }) {
  const groups = groupSummary(tour)
  const assist = tour.operationalStatus === 'NeedsAssistance'
  return (
    <div className="grid gap-2.5 px-3.5 py-3">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-[#f1f8fe] px-1.5 py-px font-mono text-[11.5px] font-bold text-[#2d719e]">{tour.code}</span>
        <TourStateBadges tour={tour} />
      </span>
      <b className="text-[13.5px] text-[#0f172a]">{tour.name} · {groups.students} học sinh</b>
      {tour.stops.length > 0 && (
        <div>
          <span className="flex gap-1" aria-hidden="true">
            {tour.stops.map((stop) => (
              <span key={stop.id} className={`h-1.5 flex-1 rounded-full ${stop.status === 'Completed' || stop.status === 'Skipped' ? 'bg-[#7db9db]' : stop.status === 'Current' ? (assist ? 'bg-[#b23e31]' : 'bg-[#2d719e]') : 'bg-[#e2e8f0]'}`} />
            ))}
          </span>
          <span className="mt-1 flex justify-between gap-1 text-[11px] text-[#64748b]">
            {tour.stops.map((stop) => <span key={stop.id} className={`min-w-0 flex-1 truncate ${stop.status === 'Current' ? `font-bold ${assist ? 'text-[#b23e31]' : 'text-[#2d719e]'}` : ''}`}>{stop.name}</span>)}
          </span>
        </div>
      )}
      <Link to={`/staff/live/${tour.id}`} className={`${buttonClass(assist ? 'danger' : 'primary')} w-full`}>{assist ? 'Xử lý hỗ trợ' : 'Mở điều hành'}</Link>
    </div>
  )
}

function NothingRunning({ tours }: { tours: TourOperation[] }) {
  const next = tours.find((tour) => tour.state === 'Ready')
  return (
    <div className="px-3.5 py-6 text-center">
      <p className="text-[13px] font-semibold text-[#64748b]">Hiện không có buổi nào đang chạy.</p>
      {next && <Link to={`/staff/tours/${next.id}/start`} className={`${buttonClass('primary')} mt-3`}>Kiểm tra & bắt đầu {next.code} · {formatTime(next.scheduledAt)}</Link>}
    </div>
  )
}

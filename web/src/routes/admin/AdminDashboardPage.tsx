import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CalendarDays, ChevronRight, ClipboardCheck, Plus } from 'lucide-react'
import type { AdminRegistration, AdminTour } from '../../api/contracts/admin'
import { buttonClass } from '../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, EmptyState, TourStateBadge } from '../../features/administration/AdminUi'
import { useAdminRegistrations, useAdminTours } from '../../features/administration/admin-hooks'
import { formatShortDay } from '../../features/administration/admin-format'
import { CardHead, KpiCard, RegistrationFunnel, StudentsByTour, StudentsPerDay, ToursByState } from '../../features/administration/components/DashboardCharts'
import { TOUR_COLOR, cardClass } from '../../features/administration/admin-visual'
import { RegistrationReviewDrawer } from '../../features/administration/components/RegistrationReviewDrawer'
import { useReviewParam } from '../../features/administration/use-review-param'

const ALL = {}
const DAY = 864e5
const pad = (n: number) => String(n).padStart(2, '0')
const dmy = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
const hm = (value: string) => { const d = new Date(value); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const startOfDay = (offset: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return d }

/** Count per day for 14 consecutive days starting `from` days away from today. */
function perDay<T>(items: T[], at: (item: T) => string, from: number, weight: (item: T) => number = () => 1): number[] {
  return Array.from({ length: 14 }, (_, i) => {
    const key = startOfDay(from + i).toDateString()
    return items.filter((item) => new Date(at(item)).toDateString() === key).reduce((s, item) => s + weight(item), 0)
  })
}

/**
 * "Tổng quan": the state of preparation at a glance. Figures and charts only;
 * the work waiting for Admin lives in the bell and the sidebar badge.
 */
export default function AdminDashboardPage() {
  const tours = useAdminTours()
  const regs = useAdminRegistrations(ALL)
  const { reviewId, close } = useReviewParam()
  const T = useMemo(() => tours.data ?? [], [tours.data])
  const R = useMemo(() => regs.data ?? [], [regs.data])

  // The moment the page opened; the figures are a snapshot, refreshed with the data.
  const [now] = useState(() => Date.now())
  const kpi = useMemo(() => {
    const open = (t: AdminTour) => t.state === 'Scheduled' || t.state === 'Ready'
    const soon = T.filter((t) => open(t) && +new Date(t.scheduledAt) >= now && +new Date(t.scheduledAt) - now < 7 * DAY).length
    const live = new Set(T.filter((t) => open(t) || t.state === 'Running').map((t) => t.id))
    const approved = R.filter((r) => r.state === 'Approved' && live.has(r.tourId))
    const pending = R.filter((r) => r.state === 'Submitted' && r.tourState === 'Scheduled')
    return {
      soon,
      soonSeries: perDay(T.filter(open), (t) => t.scheduledAt, 0),
      students: approved.reduce((s, r) => s + r.studentCount, 0),
      studentSeries: perDay(approved, (r: AdminRegistration) => r.reviewedAt ?? r.submittedAt, -13, (r) => r.studentCount),
      pending: pending.length,
      pendingSeries: perDay(R, (r) => r.submittedAt, -13),
    }
  }, [T, R, now])

  const upcoming = useMemo(() => T.filter((t) => t.state === 'Running' || t.state === 'Ready' || t.state === 'Scheduled').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).slice(0, 6), [T])
  const loading = tours.isLoading || regs.isLoading
  const failed = tours.isError || regs.isError
  const end = startOfDay(6)

  return (
    <AdminPage>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-[#111827] sm:text-[30px]">Tổng quan</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden h-9 items-center gap-2 rounded-lg bg-white px-3 text-[12.5px] font-medium text-[#374151] shadow-[0_0_0_1px_#e5e7eb] sm:inline-flex"><CalendarDays size={15} className="text-[#9ca3af]" aria-hidden="true" />{dmy(startOfDay(0))} – {dmy(end)}</span>
          <Link to="/admin/registrations/pending" className={buttonClass('secondary')}><ClipboardCheck size={16} aria-hidden="true" />Duyệt đăng ký{kpi.pending ? ` · ${kpi.pending}` : ''}</Link>
          <Link to="/admin/tours/new" className={buttonClass('primary')}><Plus size={16} aria-hidden="true" />Tạo Tour</Link>
        </div>
      </header>

      {failed ? (
        <AdminErrorPanel title="Không thể tải số liệu tổng quan." onRetry={() => { void tours.refetch(); void regs.refetch() }} />
      ) : loading ? (
        <div className="grid gap-5" aria-busy="true" aria-label="Đang tải tổng quan">
          <div className="grid gap-5 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-[190px] animate-pulse rounded-xl bg-[#eceef1] motion-reduce:animate-none" />)}</div>
          <div className="grid gap-5 lg:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-[330px] animate-pulse rounded-xl bg-[#eceef1] motion-reduce:animate-none" />)}</div>
        </div>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard title="Tour sắp tới" to="/admin/tours?state=Scheduled" label="7 ngày tới" value={kpi.soon} unit="Tour" series={kpi.soonSeries} note="Đường: số Tour mỗi ngày, 14 ngày tới" />
            <KpiCard title="Học sinh đã duyệt" to="/admin/registrations?state=APPROVED" label="Tour đang mở" value={kpi.students} unit="học sinh" series={kpi.studentSeries} note="Đường: học sinh được duyệt, 14 ngày qua" />
            <KpiCard title="Đoàn chờ duyệt" to="/admin/registrations/pending" label="Cần Admin quyết định" value={kpi.pending} unit="đoàn" series={kpi.pendingSeries} note="Đường: đăng ký mới mỗi ngày, 14 ngày qua" />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <StudentsByTour tours={T} registrations={R} now={now} />
            <StudentsPerDay tours={T} registrations={R} />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <ToursByState tours={T} />
            <section className={cardClass} aria-labelledby="dash-upcoming">
              <CardHead id="dash-upcoming" title="Tour sắp diễn ra"><Link to="/admin/tours" className={buttonClass('ghost', 'sm')}>Tất cả Tour<ChevronRight size={14} aria-hidden="true" /></Link></CardHead>
              {upcoming.length === 0 ? <EmptyState title="Chưa có Tour nào sắp diễn ra" action={<Link to="/admin/tours/new" className={buttonClass('primary', 'sm')}>Tạo Tour</Link>} /> : <UpcomingTable tours={upcoming} registrations={R} />}
            </section>
          </div>

          <div className="mt-5"><RegistrationFunnel registrations={R} /></div>
        </>
      )}
      <RegistrationReviewDrawer registrationId={reviewId} onClose={close} />
    </AdminPage>
  )
}

function UpcomingTable({ tours, registrations }: { tours: AdminTour[]; registrations: AdminRegistration[] }) {
  return (
    <div className="overflow-x-auto px-3.5 pb-2">
      <table className="w-full min-w-[620px] text-left text-[13px]" aria-label="Tour sắp diễn ra">
        <thead>
          <tr className="text-[10.5px] font-semibold tracking-[0.06em] text-[#9ca3af] uppercase">
            <th scope="col" className="rounded-l-md bg-[#f9fafb] px-3 py-2.5 font-semibold">Tour</th>
            <th scope="col" className="bg-[#f9fafb] px-3 py-2.5 text-center font-semibold">Thời gian</th>
            <th scope="col" className="bg-[#f9fafb] px-3 py-2.5 text-center font-semibold">Đoàn duyệt</th>
            <th scope="col" className="bg-[#f9fafb] px-3 py-2.5 text-center font-semibold">Học sinh</th>
            <th scope="col" className="rounded-r-md bg-[#f9fafb] px-3 py-2.5 text-center font-semibold">Sẵn sàng</th>
          </tr>
        </thead>
        <tbody>
          {tours.map((tour) => {
            const students = registrations.filter((r) => r.tourId === tour.id && r.state === 'Approved').reduce((s, r) => s + r.studentCount, 0)
            const today = new Date(tour.scheduledAt).toDateString() === new Date().toDateString()
            return (
              <tr key={tour.id} className="border-b border-[#f3f4f6] transition-colors last:border-0 hover:bg-[#fafafb]">
                <td className="px-3 py-2.5">
                  <Link to={`/admin/tours/${tour.id}`} className="group flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">
                    <span className="grid size-[34px] shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold text-white" style={{ background: TOUR_COLOR[tour.state] }}>{tour.code.replace(/^\D+/, '')}</span>
                    <span className="min-w-0"><b className="block max-w-[280px] truncate font-semibold text-[#111827] group-hover:text-[#2d719e] group-hover:underline">{tour.name}</b><span className="block truncate text-[11.5px] text-[#9ca3af]">{tour.code} · {tour.routeName}</span></span>
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-center"><b className="font-semibold text-[#111827] tabular-nums">{hm(tour.scheduledAt)}</b><span className="block text-[11.5px] text-[#9ca3af]">{today ? 'Hôm nay' : formatShortDay(tour.scheduledAt)}</span></td>
                <td className="px-3 py-2.5 text-center text-[#374151] tabular-nums">{tour.counts.approved}/{tour.counts.total}</td>
                <td className="px-3 py-2.5 text-center font-semibold text-[#16a34a] tabular-nums">{students}</td>
                <td className="px-3 py-2.5 text-center">
                  {tour.state !== 'Scheduled' ? <TourStateBadge state={tour.state} />
                    : tour.allowedActions.finalize.allowed ? <span className="rounded-md bg-[#ecfdf3] px-2 py-0.5 text-[11.5px] font-semibold text-[#15803d]">Đủ điều kiện chốt</span>
                    : <span className="rounded-md bg-[#fffbeb] px-2 py-0.5 text-[11.5px] font-semibold text-[#b45309]" title={tour.readyBlockers.join(' · ')}>Còn {tour.readyBlockers.length || 1} điều kiện</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

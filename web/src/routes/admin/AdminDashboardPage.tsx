import { useMemo } from 'react'
import { Link } from 'react-router'
import { CalendarCheck2, CalendarClock, CheckCheck, ChevronRight, ClipboardCheck, Hourglass, Plus, RefreshCcw } from 'lucide-react'
import type { AdminRegistration, AdminTour } from '../../api/contracts/admin'
import { PageHeader, SectionHeading, StatStrip, StatTile, panelClass } from '../../features/staff/StaffUi'
import { buttonClass } from '../../features/staff/ui-classes'
import { AdminErrorPanel, AdminPage, EmptyState, SkeletonRows, TourStateBadge } from '../../features/administration/AdminUi'
import { useAdminRegistrations, useAdminTours } from '../../features/administration/admin-hooks'
import { adminCounts, buildAdminTasks, type AdminTask } from '../../features/administration/admin-attention'
import { formatShortDay, formatSlot, formatStamp, untilText } from '../../features/administration/admin-format'
import { RegistrationBar, TourJourney } from '../../features/administration/components/TourParts'
import { RegistrationReviewDrawer } from '../../features/administration/components/RegistrationReviewDrawer'
import { useReviewParam } from '../../features/administration/use-review-param'

const PENDING = { state: 'Submitted' as const }

/**
 * Administration overview (scope §11.1).
 *
 *   ┌ figures ───────────────────────────────────────────────┐
 *   ├ Tour sắp tới (registrations, readiness, next step) ─┬ Chờ duyệt ┤
 *   │                                                     ├ Việc cần làm ┤
 *
 * Same frame as the operations overview: headings sit above their panels,
 * figures share one strip, and every row carries the one action it needs.
 * No robot, battery or fleet figure: those are Staff's.
 */
export default function AdminDashboardPage() {
  const tours = useAdminTours()
  const pending = useAdminRegistrations(PENDING)
  const { reviewId, open, close } = useReviewParam()

  const counts = useMemo(() => (tours.data ? adminCounts(tours.data) : null), [tours.data])
  // Reviews have their own column; the task list keeps the Tour-level work.
  const tasks = useMemo(() => (tours.data && pending.data ? buildAdminTasks(tours.data, pending.data).filter((task) => !task.id.startsWith('reg:')) : []), [tours.data, pending.data])
  const upcoming = useMemo(() => (tours.data ?? []).filter((tour) => tour.state === 'Scheduled' || tour.state === 'Ready' || tour.state === 'Running').slice(0, 6), [tours.data])
  const figure = (value?: number) => (value == null ? '-' : value)

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Quản trị Tour"
        title="Tổng quan quản trị"
        description="Theo dõi lịch tour, đăng ký đoàn và các công việc cần xử lý trước khi tour bắt đầu."
        action={<Link to="/admin/tours/new" className={buttonClass('primary')}><Plus size={17} aria-hidden="true" />Tạo Tour mới</Link>}
      />

      <StatStrip label="Chỉ số chính" columns="sm:grid-cols-2 xl:grid-cols-4">
        <StatTile to="/admin/tours?date=today" icon={CalendarClock} label="Tours hôm nay" value={figure(counts?.toursToday)} hint="Mọi trạng thái" />
        <StatTile to="/admin/registrations/pending" icon={ClipboardCheck} label="Chờ duyệt" value={figure(counts?.pending)} hint="Đăng ký đoàn cần quyết định" tone="warn" />
        <StatTile to="/admin/tours?state=Ready" icon={CalendarCheck2} label="Tours sẵn sàng" value={figure(counts?.ready)} hint="Đã chốt, chờ Staff bắt đầu" />
        <StatTile to="/admin/tours?state=Scheduled" icon={Hourglass} label="Tours cần hoàn tất chuẩn bị" value={figure(counts?.needsPreparation)} hint={counts?.invitationsPending ? `${counts.invitationsPending} đoàn chưa nhận thông tin tham gia` : 'Chưa đủ điều kiện chốt'} />
      </StatStrip>

      <div className="mt-7 grid items-start gap-6 min-[1200px]:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]">
        <section className="min-w-0" aria-label="Tour sắp tới">
          <SectionHeading title="Tour sắp tới" note={upcoming.length ? `${upcoming.length} Tour gần nhất` : undefined} action={<Link to="/admin/tours" className={buttonClass('ghost', 'sm')}>Tất cả Tour<ChevronRight size={14} aria-hidden="true" /></Link>} />
          <div className={panelClass}>
            {tours.isError ? (
              <div className="p-5"><AdminErrorPanel title="Không thể tải danh sách Tour." onRetry={() => void tours.refetch()} /></div>
            ) : tours.isLoading ? (
              <SkeletonRows rows={4} label="Đang tải Tour sắp tới" />
            ) : upcoming.length === 0 ? (
              <EmptyState title="Chưa có Tour nào" action={<Link to="/admin/tours/new" className={buttonClass('primary', 'sm')}>Tạo Tour đầu tiên</Link>} />
            ) : (
              <ul className="divide-y divide-[#efefe9]" aria-label="Tour sắp tới">
                {upcoming.map((tour) => <UpcomingRow key={tour.id} tour={tour} />)}
              </ul>
            )}
          </div>
        </section>

        <div className="min-w-0 space-y-6">
          <section aria-label="Đăng ký chờ duyệt">
            <SectionHeading title="Chờ duyệt" note={pending.data?.length ? `${pending.data.length} đoàn` : undefined} action={<Link to="/admin/registrations/pending" className={buttonClass('ghost', 'sm')}>Mở trang duyệt<ChevronRight size={14} aria-hidden="true" /></Link>} />
            <div className={panelClass}>
              {pending.isError ? (
                <div className="p-5"><AdminErrorPanel title="Không thể tải danh sách đăng ký." onRetry={() => void pending.refetch()} /></div>
              ) : pending.isLoading ? (
                <SkeletonRows rows={2} label="Đang tải đăng ký chờ duyệt" />
              ) : !pending.data?.length ? (
                <AllClear text="Tất cả đăng ký đã được xử lý." />
              ) : (
                <ul className="divide-y divide-[#efefe9]">
                  {pending.data.map((reg) => <PendingRow key={reg.id} registration={reg} onReview={open} />)}
                </ul>
              )}
            </div>
          </section>

          <section aria-label="Việc cần làm">
            <SectionHeading title="Việc cần làm" note={tasks.length ? `${tasks.length} việc` : undefined} />
            <div className={panelClass}>
              {tours.isError ? null : tours.isLoading || pending.isLoading ? (
                <SkeletonRows rows={2} label="Đang tải việc cần làm" />
              ) : tasks.length === 0 ? (
                <AllClear text="Các Tour sắp tới không thiếu điều kiện." />
              ) : (
                <ul className="divide-y divide-[#efefe9]">{tasks.map((task) => <TaskRow key={task.id} task={task} />)}</ul>
              )}
            </div>
          </section>
        </div>
      </div>

      <RegistrationReviewDrawer registrationId={reviewId} onClose={close} />
    </AdminPage>
  )
}

/** One upcoming Tour: when, what, how its groups stand, and the next step. */
function UpcomingRow({ tour }: { tour: AdminTour }) {
  const d = new Date(tour.scheduledAt)
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const next =
    tour.state === 'Scheduled' && tour.counts.submitted > 0 ? { label: 'Duyệt đăng ký', kind: 'primary' as const, to: `/admin/tours/${tour.id}?tab=registrations` }
    : tour.state === 'Scheduled' && tour.allowedActions.finalize.allowed ? { label: 'Chốt Tour', kind: 'primary' as const, to: `/admin/tours/${tour.id}` }
    : { label: tour.state === 'Running' ? 'Xem' : 'Mở Tour', kind: 'secondary' as const, to: `/admin/tours/${tour.id}` }
  return (
    <li className="grid gap-x-5 gap-y-3 px-5 py-4 transition-colors duration-150 hover:bg-[#f7f7f3] sm:grid-cols-[76px_minmax(0,1fr)_auto]">
      <div className="pt-0.5">
        <p className="text-[17px] leading-none font-bold text-[#1c1c1c] tabular-nums">{time}</p>
        <p className="mt-1.5 text-xs whitespace-nowrap text-[#8e9096]">{formatShortDay(tour.scheduledAt)}</p>
      </div>
      <div className="min-w-0">
        <p className="flex min-w-0 items-baseline gap-2">
          <Link to={`/admin/tours/${tour.id}`} className="line-clamp-2 text-[15px] font-semibold text-[#1c1c1c] hover:text-[#4d6410] hover:underline sm:line-clamp-1">{tour.name}</Link>
          <span className="shrink-0 font-mono text-[11px] text-[#8e9096]">{tour.code}</span>
        </p>
        <p className="mt-0.5 truncate text-[13px] text-[#6b6e75]">{tour.routeName} · {untilText(tour.scheduledAt)}</p>
        <div className="mt-3 w-full max-w-[360px] divide-y divide-[#efefe9] rounded-xl border border-[#ebebe4] bg-transparent px-3.5">
          <div className="py-3"><TourJourney tour={tour} /></div>
          <div className="py-3"><RegistrationBar counts={tour.counts} /></div>
        </div>
      </div>
      <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:justify-between">
        <TourStateBadge state={tour.state} />
        <Link to={next.to} className={buttonClass(next.kind, 'sm')}>{next.label}</Link>
      </div>
    </li>
  )
}

function PendingRow({ registration: reg, onReview }: { registration: AdminRegistration; onReview: (id: string) => void }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-[#f7f7f3]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[#1c1c1c]">{reg.schoolName}</p>
        <p className="mt-0.5 truncate text-xs text-[#6b6e75]">{reg.tourCode} · {formatSlot(reg.tourScheduledAt)}</p>
        {reg.resubmittedAfterApproval ? (
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#92400e]"><RefreshCcw size={12} aria-hidden="true" />Danh sách cập nhật, cần duyệt lại</p>
        ) : (
          <p className="mt-1 text-xs text-[#8e9096]">{reg.studentCount} học sinh, gửi {formatStamp(reg.submittedAt)}</p>
        )}
      </div>
      <button type="button" onClick={() => onReview(reg.id)} className={buttonClass('primary', 'sm')}>Duyệt ngay</button>
    </li>
  )
}

const TASK_EDGE = { warn: 'border-l-[#d69412]', ok: 'border-l-[#5f7a12]', info: 'border-l-[#9cc93a]' } as const

function TaskRow({ task }: { task: AdminTask }) {
  return (
    <li className={`flex items-start gap-3 border-l-[3px] px-4 py-3.5 ${TASK_EDGE[task.tone]}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#1c1c1c]">{task.title}</p>
        {task.detail && <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[#6b6e75]">{task.detail}</p>}
      </div>
      <Link to={task.to} className={buttonClass(task.tone === 'ok' ? 'primary' : 'secondary', 'sm')}>{task.actionLabel}</Link>
    </li>
  )
}

function AllClear({ text }: { text: string }) {
  return <p className="flex items-center gap-2.5 px-5 py-4 text-sm font-medium text-[#4d6410]"><CheckCheck size={18} aria-hidden="true" />{text}</p>
}

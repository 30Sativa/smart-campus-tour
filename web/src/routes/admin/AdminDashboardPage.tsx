import { useMemo } from 'react'
import { Link } from 'react-router'
import { ArrowUpRight, CalendarClock, CheckCheck, ChevronRight, ClipboardCheck, Plus } from 'lucide-react'
import type { AdminTour } from '../../api/contracts/admin'
import { PageHeader, SectionHeading, StatStrip, StatTile, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, EmptyState, SkeletonRows, TourStateBadge } from '../../features/administration/AdminUi'
import { useAdminRegistrations, useAdminTours } from '../../features/administration/admin-hooks'
import { adminCounts, buildAdminTasks } from '../../features/administration/admin-attention'
import { formatShortDay, formatSlot, untilText } from '../../features/administration/admin-format'
import { RegistrationReviewDrawer } from '../../features/administration/components/RegistrationReviewDrawer'
import { useReviewParam } from '../../features/administration/use-review-param'

const PENDING = { state: 'Submitted' as const }
const STEPS = [
  ['01', 'Tạo Tour', 'Tên, giờ, tuyến có sẵn'],
  ['02', 'Nhận đăng ký', 'Đoàn gửi thông tin'],
  ['03', 'Duyệt & lời mời', 'Quyết định từng người'],
  ['04', 'Chốt READY', 'Khóa nội dung / đăng ký'],
  ['05', 'Staff Start', 'Kiểm tra robot, stream'],
] as const

export default function AdminDashboardPage() {
  const tours = useAdminTours()
  const pending = useAdminRegistrations(PENDING)
  const { reviewId, open, close } = useReviewParam()
  const counts = useMemo(() => (tours.data ? adminCounts(tours.data) : null), [tours.data])
  const tasks = useMemo(
    () => (tours.data && pending.data ? buildAdminTasks(tours.data, pending.data).filter((task) => !task.id.startsWith('reg:')) : []),
    [tours.data, pending.data],
  )
  const upcoming = useMemo(
    () => (tours.data ?? []).filter((tour) => tour.state === 'Scheduled' || tour.state === 'Ready' || tour.state === 'Running').slice(0, 6),
    [tours.data],
  )
  const lead = upcoming.find((tour) => tour.state === 'Scheduled') ?? upcoming.find((tour) => tour.state === 'Ready') ?? upcoming[0]
  const priorityCount = (pending.data?.length ?? 0) + tasks.length
  const figure = (value?: number) => (value == null ? '-' : value)

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Trung tâm điều phối · Quản trị Tour"
        title="Một nơi để chuẩn bị mọi buổi tham quan."
        description="Ưu tiên những quyết định cần hoàn tất trước khi bàn giao cho Staff."
        action={<Link to="/admin/tours/new" className={buttonClass('primary')}><Plus size={17} aria-hidden="true" />Tạo Tour mới</Link>}
      />

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(290px,0.9fr)]">
        <section aria-label="Tour tiếp theo" className="relative flex min-h-[330px] flex-col overflow-hidden rounded-[20px] border border-[#cde4f5] bg-[#e9f5ff] p-6 sm:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-14 -bottom-24 size-72 rounded-full border border-[#beddf2] sm:size-96" />
          <div aria-hidden="true" className="pointer-events-none absolute right-8 -bottom-20 size-48 rounded-full border border-[#beddf2] sm:size-72" />
          <span className="relative self-start rounded-full border border-[#badcf3] bg-white/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#4787a9]">Tour tiếp theo · {lead?.state ?? 'Chưa có lịch'}</span>
          <div className="relative mt-9 max-w-[570px]">
            <h2 className="text-[28px] font-bold leading-[1.16] tracking-[-0.055em] text-[#123a59] sm:text-[34px]">{lead?.name ?? 'Tạo Tour đầu tiên cho khuôn viên'}</h2>
            <p className="mt-3 text-[13px] leading-6 text-[#5c7b91]">
              {lead ? `${formatSlot(lead.scheduledAt)} · ${lead.routeName} · ${lead.counts.approved} đoàn đã duyệt` : 'Lịch Tour, đăng ký và điều kiện sẵn sàng sẽ hiển thị tại đây.'}
            </p>
          </div>
          <div className="relative mt-auto flex flex-wrap items-end justify-between gap-3 pt-8">
            <Link to={lead ? `/admin/tours/${lead.id}` : '/admin/tours/new'} className={buttonClass('primary')}>
              {lead ? `Xử lý Tour ${lead.code}` : 'Tạo Tour'}<ArrowUpRight size={16} aria-hidden="true" />
            </Link>
            {lead && <span className="text-xs font-medium text-[#5c7b91]">{lead.counts.submitted} đoàn chờ quyết định</span>}
          </div>
        </section>

        <section aria-label="Ưu tiên hôm nay" className={`${panelClass} p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="text-lg font-bold tracking-tight text-[#123a59]">Ưu tiên hôm nay</h2><p className="mt-1 text-xs text-[#738da2]">Tập trung vào việc cần ra quyết định.</p></div>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#c9e9ff] text-xs font-bold text-[#174b70]">{priorityCount}</span>
          </div>
          {pending.isError || tours.isError ? <div className="mt-5"><AdminErrorPanel title="Không thể tải công việc ưu tiên." onRetry={() => { void pending.refetch(); void tours.refetch() }} /></div>
            : pending.isLoading || tours.isLoading ? <SkeletonRows rows={3} label="Đang tải việc ưu tiên" />
            : priorityCount === 0 ? <p className="mt-6 text-sm text-[#477e9e]">Không có việc nào đang chờ.</p>
            : <ol className="mt-5 divide-y divide-[#e7eff6]">
                {pending.data?.slice(0, 2).map((reg, index) => <li key={reg.id} className="flex gap-3 py-4"><PriorityNumber index={index} /><div className="min-w-0"><p className="text-[13px] font-bold text-[#173b59]">Duyệt đoàn {reg.schoolName}</p><p className="mt-1 text-xs text-[#859bad]">{reg.studentCount} học sinh · {reg.tourCode}</p><button type="button" onClick={() => open(reg.id)} className="mt-2 text-xs font-bold text-[#2d78a9] hover:underline">Mở hồ sơ đoàn ↗</button></div></li>)}
                {tasks.slice(0, Math.max(1, 3 - Math.min(pending.data?.length ?? 0, 2))).map((task, index) => <li key={task.id} className="flex gap-3 py-4"><PriorityNumber index={index + Math.min(pending.data?.length ?? 0, 2)} /><div className="min-w-0"><p className="text-[13px] font-bold text-[#173b59]">{task.title}</p><p className="mt-1 line-clamp-2 text-xs text-[#859bad]">{task.detail}</p><Link to={task.to} className="mt-2 inline-block text-xs font-bold text-[#2d78a9] hover:underline">{task.actionLabel} ↗</Link></div></li>)}
              </ol>}
        </section>
      </div>

      <StatStrip label="Chỉ số chuẩn bị Tour" columns="sm:grid-cols-3">
        <StatTile to="/admin/tours?date=today" icon={CalendarClock} label="Tours hôm nay" value={figure(counts?.toursToday)} hint="Mọi trạng thái" />
        <StatTile to="/admin/registrations/pending" icon={ClipboardCheck} label="Đoàn chờ duyệt" value={figure(counts?.pending)} hint="Cần Admin quyết định" tone="warn" />
        <StatTile to="/admin/tours?state=Ready" icon={CheckCheck} label="Tours đã READY" value={figure(counts?.ready)} hint="Chờ Staff kiểm tra thiết bị" />
      </StatStrip>

      <section className="mt-7" aria-label="Luồng chuẩn bị Tour">
        <SectionHeading title="Luồng chuẩn bị một buổi Tour" note="READY tách khỏi kiểm tra thiết bị trước Start" />
        <ol className="grid gap-3 rounded-[18px] border border-[#d9e9f5] bg-white p-5 sm:grid-cols-5">
          {STEPS.map(([number, title, detail]) => <li key={number} className="min-w-0"><span className="grid size-7 place-items-center rounded-full bg-[#e5f3ff] text-[10px] font-bold text-[#2c719e]">{number}</span><p className="mt-2 text-xs font-bold text-[#173b59]">{title}</p><p className="mt-1 text-[11px] leading-4 text-[#8ca1b0]">{detail}</p></li>)}
        </ol>
      </section>

      <section className="mt-7" aria-label="Các buổi sắp tới">
        <SectionHeading title="Các buổi sắp tới" note={upcoming.length ? `${upcoming.length} Tour gần nhất` : undefined} action={<Link to="/admin/tours" className={buttonClass('ghost', 'sm')}>Tất cả Tour<ChevronRight size={14} aria-hidden="true" /></Link>} />
        <div className={panelClass}>
          {tours.isError ? <div className="p-5"><AdminErrorPanel title="Không thể tải danh sách Tour." onRetry={() => void tours.refetch()} /></div>
            : tours.isLoading ? <SkeletonRows rows={4} label="Đang tải Tour sắp tới" />
            : upcoming.length === 0 ? <EmptyState title="Chưa có Tour nào" action={<Link to="/admin/tours/new" className={buttonClass('primary', 'sm')}>Tạo Tour đầu tiên</Link>} />
            : <ul className="divide-y divide-[#e7eff6]">{upcoming.map((tour) => <UpcomingRow key={tour.id} tour={tour} />)}</ul>}
        </div>
      </section>
      <RegistrationReviewDrawer registrationId={reviewId} onClose={close} />
    </AdminPage>
  )
}

function PriorityNumber({ index }: { index: number }) {
  return <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#e4f2fc] text-[10px] font-extrabold text-[#347da8]">{String(index + 1).padStart(2, '0')}</span>
}

function UpcomingRow({ tour }: { tour: AdminTour }) {
  const d = new Date(tour.scheduledAt)
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const next =
    tour.state === 'Scheduled' && tour.counts.submitted > 0 ? { label: 'Duyệt đăng ký', kind: 'primary' as const, to: `/admin/tours/${tour.id}?tab=registrations` }
    : tour.state === 'Scheduled' && tour.allowedActions.finalize.allowed ? { label: 'Chốt Tour', kind: 'primary' as const, to: `/admin/tours/${tour.id}` }
    : { label: 'Xem Tour', kind: 'secondary' as const, to: `/admin/tours/${tour.id}` }
  return (
    <li className="grid gap-x-5 gap-y-3 px-5 py-4 transition-colors hover:bg-[#f8fbff] sm:grid-cols-[64px_minmax(0,1fr)_110px_130px] sm:items-center">
      <div><p className="text-[17px] font-bold tracking-tight text-[#123a59] tabular-nums">{time}</p><p className="text-xs text-[#899eae]">{formatShortDay(tour.scheduledAt)}</p></div>
      <div className="min-w-0"><Link to={`/admin/tours/${tour.id}`} className="block truncate text-sm font-bold text-[#173b59] hover:text-[#2d78a9] hover:underline">{tour.name}</Link><p className="mt-1 truncate text-xs text-[#859bad]">{tour.code} · {tour.routeName} · {untilText(tour.scheduledAt)}</p></div>
      <TourStateBadge state={tour.state} />
      <Link to={next.to} className={buttonClass(next.kind, 'sm')}>{next.label}</Link>
    </li>
  )
}

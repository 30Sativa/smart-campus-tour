import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { KpiRow, KpiTile } from '../../../components/ui/Charts'
import { PageHeader, PanelHead, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, tdClass, thClass } from '../../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, EmptyState, SkeletonRows } from '../../../features/administration/AdminUi'
import { useTours } from '../../../features/administration/tours/hooks'
import { formatSlot } from '../../../features/administration/admin-format'
import { useRegistrationReviews } from '../../../features/administration/registrations/hooks'
import { usePoiProposals } from '../../../features/technical/technical-hooks'
import { useReviewParam } from '../../../features/administration/use-review-param'
import { ReviewDrawer } from '../../../features/administration/registrations/components/ReviewDrawer'

/** Each summary reads the same API and totals as its destination list. */
export default function StaffManageDashboardPage() {
  const tours = useTours({ state: 'SCHEDULED', page: 1, size: 5 })
  const ready = useTours({ state: 'READY', page: 1, size: 1 })
  const registrations = useRegistrationReviews({ state: 'SUBMITTED', page: 1, size: 5, sort: 'submittedAt' })
  const pois = usePoiProposals()
  const { reviewId, close } = useReviewParam()
  const totalTours = tours.isSuccess ? tours.data.pagination.totalItems : undefined
  const pending = registrations.isSuccess ? registrations.data.pagination.totalItems : undefined
  return <AdminPage>
    <PageHeader eyebrow="Chuẩn bị Tour" title="Tổng quan chuẩn bị"
      description="Duyệt đăng ký, hoàn thiện điểm tham quan và chuẩn bị các Tour."
      action={<Link to="/staff/manage/tours/new" className={buttonClass('primary')}><Plus size={16} aria-hidden="true" />Tạo Tour</Link>} />
    <KpiRow label="Số liệu chuẩn bị">
      <KpiTile to="/staff/manage/registrations/pending" label="Đoàn chờ duyệt" value={pending ?? '-'} note={registrations.isError ? 'Không tải được' : undefined} tone={pending ? 'warn' : 'plain'} />
      <KpiTile to="/staff/schedule?view=list" label="Tour đang chuẩn bị" value={totalTours ?? '-'} note={tours.isError ? 'Không tải được' : undefined} />
      <KpiTile to="/staff/schedule?view=list&state=READY" label="Tour sẵn sàng" value={ready.isSuccess ? ready.data.pagination.totalItems : '-'} note={ready.isError ? 'Không tải được' : undefined} />
      <KpiTile to="/staff/manage/pois" label="Đề xuất POI" value={pois.isSuccess ? pois.data.length : '-'} note={pois.isError ? 'Không tải được' : undefined} />
    </KpiRow>

    <section className={`${panelClass} mb-5`} aria-label="Đăng ký cần duyệt">
      <PanelHead title="Đăng ký cần duyệt" description="Các đoàn gửi trước được hiển thị trước."
        action={<Link to="/staff/manage/registrations/pending" className={buttonClass('secondary', 'sm')}>Mở hàng chờ</Link>} />
      {registrations.isError ? <AdminErrorPanel title="Không tải được đăng ký chờ duyệt." onRetry={() => void registrations.refetch()} /> : registrations.isPending ? <SkeletonRows rows={3} /> : !registrations.data.data.length ? <EmptyState title="Không có đoàn đang chờ duyệt" /> :
        <ul className="divide-y divide-[#eef1f4]">{registrations.data.data.map(reg => <li key={reg.id} className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#0f172a]">{reg.groupName}</p><p className="mt-1 text-xs text-[#64748b]">{reg.schoolName} · {reg.tourName}</p></div>
          <Link to={`/staff/manage/registrations/pending?review=${encodeURIComponent(reg.id)}`} className={buttonClass('secondary', 'sm')}>Xem & duyệt<span className="sr-only"> {reg.groupName}</span></Link>
        </li>)}</ul>}
    </section>

    <section className={panelClass} aria-label="Tour đang chuẩn bị">
      <PanelHead title="Tour đang chuẩn bị" description={totalTours != null ? `Hiển thị ${tours.data?.data.length ?? 0} trong ${totalTours} Tour đang chuẩn bị.` : undefined}
        action={<Link to="/staff/schedule?view=list" className={buttonClass('secondary', 'sm')}>Tất cả Tour</Link>} />
      {tours.isError ? <AdminErrorPanel title="Không tải được danh sách Tour." onRetry={() => void tours.refetch()} /> : tours.isPending ? <SkeletonRows rows={3} /> : !tours.data.data.length ? <EmptyState title="Chưa có Tour đang chuẩn bị" action={<Link to="/staff/manage/tours/new" className={buttonClass('primary', 'sm')}>Tạo Tour</Link>} /> :
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left" aria-label="Tour đang chuẩn bị">
          <thead><tr>{['Tour', 'Thời gian', 'Tuyến', 'Đoàn đăng ký'].map(label => <th key={label} scope="col" className={thClass}>{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#eef1f4]">{tours.data.data.map(tour => <tr key={tour.id}>
            <td className={tdClass}><Link to={`/staff/manage/tours/${tour.id}`} className="font-semibold text-[#173b59] hover:underline">{tour.name}</Link></td>
            <td className={`${tdClass} whitespace-nowrap`}>{formatSlot(tour.scheduledStartAt)}</td>
            <td className={tdClass}>{tour.routeName}</td><td className={tdClass}>{tour.registrationCount} đoàn</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
    {reviewId && <ReviewDrawer key={reviewId} id={reviewId} onClose={close} />}
  </AdminPage>
}

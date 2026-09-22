import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, panelClass } from '../../features/staff/StaffUi'
import { buttonClass } from '../../features/staff/ui-classes'
import { AdminErrorPanel, AdminPage, Notice, SkeletonRows } from '../../features/administration/AdminUi'
import { useAdminRoutes, useAdminTour, useUpdateTour } from '../../features/administration/admin-hooks'
import { isStale, readAdminError } from '../../features/administration/admin-status'
import { TourForm } from '../../features/administration/components/TourForm'

/**
 * Edit a Tour while it is Scheduled (UC-01 step 5). Ready, Running and
 * finished Tours are locked: the page says why and offers the way back
 * instead of a form that would be refused.
 */
export default function AdminTourEditPage() {
  const { tourId = '' } = useParams()
  const navigate = useNavigate()
  const tour = useAdminTour(tourId)
  const routes = useAdminRoutes()
  const update = useUpdateTour()
  const error = update.isError ? readAdminError(update.error, 'Không lưu được thay đổi. Kiểm tra kết nối rồi thử lại.') : null
  const data = tour.data
  const back = `/admin/tours/${tourId}`

  return (
    <AdminPage>
      <Link to={back} className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#2563eb] hover:underline"><ArrowLeft size={15} aria-hidden="true" />Về chi tiết Tour</Link>
      <PageHeader eyebrow="Quản lý Tour" title={data ? `Sửa ${data.name}` : 'Sửa Tour'} description="Chỉ sửa được khi Tour đang chuẩn bị. Nếu đã gửi thông tin tham gia mà đổi giờ, hãy gửi lại cho các đoàn." />
      {tour.isError || routes.isError ? (
        <AdminErrorPanel title="Không tải được Tour." onRetry={() => { void tour.refetch(); void routes.refetch() }} />
      ) : !data || routes.isLoading ? (
        <SkeletonRows rows={5} label="Đang tải biểu mẫu" />
      ) : !data.allowedActions.edit.allowed ? (
        <div className={`${panelClass} space-y-4 p-6`}>
          <Notice tone="warn">{data.allowedActions.edit.reason}</Notice>
          <Link to={back} className={buttonClass('secondary')}>Về chi tiết Tour</Link>
        </div>
      ) : (
        <>
          {error && isStale(update.error) && (
            <div className="mb-4">
              <Notice tone="warn" action={<button type="button" onClick={() => { update.reset(); void tour.refetch() }} className={buttonClass('secondary', 'sm')}>Tải lại</button>}>Dữ liệu đã thay đổi. Vui lòng tải lại.</Notice>
            </div>
          )}
          <TourForm
            key={data.version}
            initial={{ name: data.name, scheduledAt: data.scheduledAt, description: data.description, routeId: data.routeId }}
            routes={routes.data ?? []}
            submitLabel="Lưu thay đổi"
            busy={update.isPending}
            serverErrors={error?.fieldErrors}
            serverMessage={error && !isStale(update.error) ? (Object.keys(error.fieldErrors).length ? 'Vui lòng kiểm tra lại các trường được đánh dấu.' : error.message) : null}
            cancelTo={back}
            onSubmit={(input) => update.mutate({ id: data.id, input, version: data.version }, { onSuccess: () => navigate(back) })}
          />
        </>
      )}
    </AdminPage>
  )
}

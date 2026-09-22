import { useState } from 'react'
import { useNavigate } from 'react-router'
import { PageHeader } from '../../features/staff/StaffUi'
import { AdminErrorPanel, AdminPage, SkeletonRows } from '../../features/administration/AdminUi'
import { useAdminRoutes, useCreateTour } from '../../features/administration/admin-hooks'
import { readAdminError } from '../../features/administration/admin-status'
import { TourForm } from '../../features/administration/components/TourForm'

function newRequestId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * "Tạo Tour mới" (UC-01). The result is a Scheduled Tour with no robot and
 * no leg; Admin lands on its detail page to check it. One request id per
 * form, so a repeated submit returns the same Tour instead of a second one.
 */
export default function AdminTourCreatePage() {
  const navigate = useNavigate()
  const routes = useAdminRoutes()
  const create = useCreateTour()
  const [requestId] = useState(newRequestId)
  const error = create.isError ? readAdminError(create.error, 'Không tạo được Tour. Kiểm tra kết nối rồi thử lại.') : null

  return (
    <AdminPage>
      <PageHeader eyebrow="Quản lý Tour" title="Tạo Tour mới" description="Tour mới ở trạng thái Đang chuẩn bị: chưa gán robot và không tự chạy khi tới giờ. Sau khi tạo, đại diện trường có thể đăng ký." />
      {routes.isError ? (
        <AdminErrorPanel title="Không tải được danh mục tuyến." onRetry={() => void routes.refetch()} />
      ) : routes.isLoading ? (
        <SkeletonRows rows={5} label="Đang tải biểu mẫu" />
      ) : (
        <TourForm
          routes={routes.data ?? []}
          submitLabel="Tạo Tour"
          busy={create.isPending}
          serverErrors={error?.fieldErrors}
          serverMessage={error && !Object.keys(error.fieldErrors).length ? error.message : error ? 'Vui lòng kiểm tra lại các trường được đánh dấu.' : null}
          cancelTo="/admin/tours"
          onSubmit={(input) => create.mutate({ input, requestId }, { onSuccess: (tour) => navigate(`/admin/tours/${tour.id}`, { replace: true }) })}
        />
      )}
    </AdminPage>
  )
}

import { useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, Notice, SkeletonRows } from '../../../features/administration/AdminUi'
import { newRequestId, useTour, useUpdateTour } from '../../../features/administration/tours/hooks'
import { tourError } from '../../../features/administration/tours/tour-messages'
import { TourForm } from '../../../features/administration/tours/TourForm'
import type { TourInput } from '../../../features/administration/tours/types'

/** Edit a SCHEDULED Tour. Schedule and Route lock once it has registrations or history (ADR-0018). */
export default function AdminTourEditPage() {
  const { tourId = '' } = useParams()
  const navigate = useNavigate()
  const detail = useTour(tourId)
  const update = useUpdateTour()
  const attempt = useRef<{ key: string; id: string } | null>(null)
  const back = `/staff/manage/tours/${tourId}`
  const data = detail.data

  const submit = (input: TourInput, routeVersion: string) => {
    if (!data) return
    const key = JSON.stringify([input, routeVersion, data.tour.rowVersion])
    if (attempt.current?.key !== key) attempt.current = { key, id: newRequestId() }
    update.mutate({ id: tourId, requestId: attempt.current.id, rowVersion: data.tour.rowVersion,
      routeVersion: input.routeId === data.tour.routeId ? null : routeVersion, input }, { onSuccess: () => navigate(back) })
  }

  return <AdminPage>
    <Link to={back} className="mb-4 inline-block text-sm text-[#2d719e]">← Về chi tiết Tour</Link>
    <PageHeader eyebrow="Quản lý Tour" title={data ? `Sửa ${data.tour.name}` : 'Sửa Tour'} description="Chỉ sửa được khi Tour đang nhận đăng ký và chưa vận hành." />
    {detail.isError ? <AdminErrorPanel title={tourError(detail.error)} onRetry={() => void detail.refetch()} />
      : !data ? <SkeletonRows rows={5} label="Đang tải biểu mẫu" />
      : !data.permissions.canEditMetadata ? <div className={`${panelClass} space-y-4 p-6`}>
        <Notice tone="warn">Tour không còn sửa được ở trạng thái hiện tại.</Notice>
        <Link to={back} className={buttonClass('secondary')}>Về chi tiết Tour</Link>
      </div>
      : <TourForm key={data.tour.rowVersion}
        initial={{ name: data.tour.name, description: data.tour.description, routeId: data.tour.routeId, scheduledStartAt: data.tour.scheduledStartAt, fallbackVideoUrl: data.fallbackVideoUrl }}
        currentRoute={{ id: data.tour.routeId, name: data.tour.routeName }}
        scheduleLocked={!data.permissions.canChangeScheduleAndRoute}
        submitLabel="Lưu thay đổi" busy={update.isPending} error={update.isError ? tourError(update.error) : null} cancelTo={back} onSubmit={submit} />}
  </AdminPage>
}

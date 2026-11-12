import { useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { PageHeader } from '../../../components/ui/ConsolePrimitives'
import { AdminPage } from '../../../features/administration/AdminUi'
import { newRequestId, useCreateTour } from '../../../features/administration/tours/hooks'
import { tourError } from '../../../features/administration/tours/tour-messages'
import { CreateTourForm } from '../../../features/administration/tours/CreateTourForm'
import { tourKindOf } from '../../../features/administration/tours/quick-tour'
import type { CreateTourInput } from '../../../features/administration/tours/types'
import { celebrate } from '../../../components/ui/toast-store'

/**
 * "Tạo Tour mới" against the live API: a Tour on a shift, or a quick Tour (ADR-0053). A retried identical submit
 * reuses its request id, so a lost response cannot create a second Tour; changed content gets a new id instead of an
 * IDEMPOTENCY_CONFLICT.
 */
export default function StaffManageTourCreatePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const quick = tourKindOf(params.get('kind')) === 'quick'
  const create = useCreateTour()
  const attempt = useRef<{ key: string; id: string } | null>(null)
  const submit = (input: CreateTourInput) => {
    const key = JSON.stringify(input)
    if (attempt.current?.key !== key) attempt.current = { key, id: newRequestId() }
    create.mutate({ requestId: attempt.current.id, input }, { onSuccess: id => {
      celebrate({ title: `Đã tạo Tour “${input.name}”`, detail: input.shortNoticeReason
        ? 'Robot đã được giữ. Chốt danh sách rồi Start; màn hình Start cho biết bao nhiêu điểm xem đã vào phòng chờ.'
        : 'Tour đang nhận đăng ký. Đại diện trường đã thấy Tour và có thể đăng ký đoàn.', action: { label: 'Lịch Tour', to: '/staff/schedule' } })
      navigate(`/staff/manage/tours/${id}`, { replace: true })
    } })
  }
  return <AdminPage>
    <Link to="/staff/schedule" className="mb-4 inline-block text-sm text-[#2d719e]">← Lịch Tour</Link>
    <PageHeader eyebrow="Chuẩn bị Tour" title="Tạo Tour mới" description={quick
      ? 'Tour nhanh giữ robot ngay từ lúc tạo và không chờ tới giờ: chốt danh sách, đủ người là Start được.'
      : 'Tour mới ở trạng thái Đang nhận đăng ký: giữ chỗ robot nhưng không tự chạy khi tới giờ. Sau khi tạo, đại diện trường thấy Tour và có thể đăng ký đoàn.'} />
    <CreateTourForm busy={create.isPending} error={create.isError ? tourError(create.error) : null} onSubmit={submit} />
  </AdminPage>
}

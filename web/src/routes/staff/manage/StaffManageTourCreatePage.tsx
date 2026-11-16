import { useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { PageHeader } from '../../../components/ui/ConsolePrimitives'
import { AdminPage } from '../../../features/administration/AdminUi'
import { newRequestId, useCreateTour } from '../../../features/administration/tours/hooks'
import { tourError } from '../../../features/administration/tours/tour-messages'
import { CreateTourForm } from '../../../features/administration/tours/CreateTourForm'
import { QUICK_TOUR_RULES, tourKindOf } from '../../../features/administration/tours/quick-tour'
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
      // The Tour page it opens says what comes next, so the toast only confirms what happened.
      celebrate({ title: `Đã tạo Tour “${input.name}”`, detail: 'Robot đã được giữ.', action: { label: 'Lịch Tour', to: '/staff/schedule' } })
      navigate(`/staff/manage/tours/${id}`, { replace: true })
    } })
  }
  return <AdminPage>
    <Link to="/staff/schedule" className="mb-4 inline-block text-sm text-[#2d719e]">← Lịch Tour</Link>
    <PageHeader eyebrow="Chuẩn bị Tour" title="Tạo Tour" description={quick
      ? QUICK_TOUR_RULES.pageDescription
      : 'Tour mới ở trạng thái Đang nhận đăng ký: giữ chỗ robot nhưng không tự chạy khi tới giờ. Sau khi tạo, đại diện trường thấy Tour và có thể đăng ký đoàn.'} />
    <CreateTourForm busy={create.isPending} error={create.isError ? tourError(create.error, { quick }) : null} onSubmit={submit} />
  </AdminPage>
}

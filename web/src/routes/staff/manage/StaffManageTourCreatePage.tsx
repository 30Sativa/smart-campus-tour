import { useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { PageHeader } from '../../../components/ui/ConsolePrimitives'
import { AdminPage } from '../../../features/administration/AdminUi'
import { newRequestId, useCreateQuickTour, useCreateTour } from '../../../features/administration/tours/hooks'
import { tourError } from '../../../features/administration/tours/tour-messages'
import { CreateTourForm } from '../../../features/administration/tours/CreateTourForm'
import { tourKindOf } from '../../../features/administration/tours/quick-tour'
import type { CreateTourInput, QuickTourInput } from '../../../features/administration/tours/types'
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
  const createQuick = useCreateQuickTour()
  const attempt = useRef<{ key: string; id: string } | null>(null)
  const requestIdFor = (input: CreateTourInput | QuickTourInput) => {
    const key = JSON.stringify(input)
    if (attempt.current?.key !== key) attempt.current = { key, id: newRequestId() }
    return attempt.current.id
  }
  const created = (name: string, detail: string, back: string) => (id: string) => {
    celebrate({ title: `Đã tạo Tour “${name}”`, detail, action: { label: 'Lịch Tour', to: back } })
    navigate(`/staff/manage/tours/${id}`, { replace: true })
  }
  const submit = (input: CreateTourInput) =>
    create.mutate({ requestId: requestIdFor(input), input }, { onSuccess: created(input.name,
      'Tour đang nhận đăng ký. Đại diện trường đã thấy Tour và có thể đăng ký đoàn.', '/staff/schedule') })
  const submitQuick = (input: QuickTourInput) =>
    createQuick.mutate({ requestId: requestIdFor(input), input }, { onSuccess: created(input.name,
      'Robot đã được giữ. Chốt danh sách rồi Start khi mọi điểm xem đã vào phòng chờ.', '/staff/schedule?kind=quick') })
  const mutation = quick ? createQuick : create
  return <AdminPage>
    <Link to={quick ? '/staff/schedule?kind=quick' : '/staff/schedule'} className="mb-4 inline-block text-sm text-[#2d719e]">← Lịch Tour</Link>
    <PageHeader eyebrow="Chuẩn bị Tour" title="Tạo Tour mới" description={quick
      ? 'Tour nhanh giữ robot ngay từ lúc tạo và không chờ tới giờ: chốt danh sách, đủ người là Start được.'
      : 'Tour mới ở trạng thái Đang nhận đăng ký: giữ chỗ robot nhưng không tự chạy khi tới giờ. Sau khi tạo, đại diện trường thấy Tour và có thể đăng ký đoàn.'} />
    <CreateTourForm busy={mutation.isPending} error={mutation.isError ? tourError(mutation.error) : null} onSubmit={submit} onSubmitQuick={submitQuick} />
  </AdminPage>
}

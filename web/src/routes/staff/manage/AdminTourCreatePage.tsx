import { useRef } from 'react'
import { Link, useNavigate } from 'react-router'
import { PageHeader } from '../../../components/ui/ConsolePrimitives'
import { AdminPage } from '../../../features/administration/AdminUi'
import { newRequestId, useCreateTour } from '../../../features/administration/tours/hooks'
import { tourError } from '../../../features/administration/tours/tour-messages'
import { TourForm } from '../../../features/administration/tours/TourForm'
import type { TourInput } from '../../../features/administration/tours/types'
import { notify } from '../../../components/ui/toast-store'

/**
 * "Tạo Tour mới" against the live API. A retried identical submit reuses its
 * request id, so a lost response cannot create a second Tour; changed content
 * gets a new id instead of an IDEMPOTENCY_CONFLICT.
 */
export default function AdminTourCreatePage() {
  const navigate = useNavigate()
  const create = useCreateTour()
  const attempt = useRef<{ key: string; id: string } | null>(null)
  const submit = (input: TourInput, routeVersion: string) => {
    const key = JSON.stringify([input, routeVersion])
    if (attempt.current?.key !== key) attempt.current = { key, id: newRequestId() }
    create.mutate({ requestId: attempt.current.id, routeVersion, input }, { onSuccess: id => {
      notify({ title: `Đã tạo Tour “${input.name}”`, detail: 'Tour đang nhận đăng ký. Đại diện trường đã thấy Tour và có thể đăng ký đoàn.', action: { label: 'Danh sách Tour', to: '/staff/manage/tours' } })
      navigate(`/staff/manage/tours/${id}`, { replace: true })
    } })
  }
  return <AdminPage>
    <Link to="/staff/manage/tours" className="mb-4 inline-block text-sm text-[#2d719e]">← Danh sách Tour</Link>
    <PageHeader eyebrow="Quản lý Tour" title="Tạo Tour mới" description="Tour mới ở trạng thái Đang nhận đăng ký: chưa gán robot và không tự chạy khi tới giờ. Sau khi tạo, đại diện trường thấy Tour và có thể đăng ký đoàn." />
    <TourForm submitLabel="Tạo Tour" busy={create.isPending} error={create.isError ? tourError(create.error) : null} cancelTo="/staff/manage/tours" onSubmit={submit} />
  </AdminPage>
}

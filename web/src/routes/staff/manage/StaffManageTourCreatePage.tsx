import { useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { usePageTitle } from '../../../components/ui/use-page-title'
import { AdminPage } from '../../../features/administration/AdminUi'
import { newRequestId, useCreateTour } from '../../../features/administration/tours/hooks'
import { tourError } from '../../../features/administration/tours/tour-messages'
import { CreateTourForm } from '../../../features/administration/tours/CreateTourForm'
import { QUICK_TOUR_RULES, tourKindOf } from '../../../features/administration/tours/quick-tour'
import type { CreateTourInput } from '../../../features/administration/tours/types'
import { celebrate, notify } from '../../../components/ui/toast-store'
import { coverUploadError, uploadTourCover } from '../../../features/administration/tours/api/cover-image'

/**
 * "Tạo Tour mới" against the live API: a Tour on a shift, or a quick Tour (ADR-0053). A retried identical submit
 * reuses its request id, so a lost response cannot create a second Tour; changed content gets a new id instead of an
 * IDEMPOTENCY_CONFLICT. A picked cover image is uploaded once the Tour exists, since it is filed under the Tour's id;
 * if that upload fails the Tour stays created and Staff can add the image from "Sửa Tour".
 */
export default function StaffManageTourCreatePage() {
  usePageTitle('Tạo Tour')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const quick = tourKindOf(params.get('kind')) === 'quick'
  const create = useCreateTour()
  const attempt = useRef<{ key: string; id: string } | null>(null)
  const [uploadingCover, setUploadingCover] = useState(false)
  const submit = (input: CreateTourInput, cover: File | null) => {
    const key = JSON.stringify(input)
    if (attempt.current?.key !== key) attempt.current = { key, id: newRequestId() }
    create.mutate({ requestId: attempt.current.id, input }, { onSuccess: async id => {
      if (cover) {
        setUploadingCover(true)
        try {
          await uploadTourCover(id, cover)
        } catch (error) {
          notify({ tone: 'error', title: 'Tour đã tạo nhưng chưa tải được ảnh', detail: coverUploadError(error), action: { label: 'Sửa Tour', to: `/staff/manage/tours/${id}/edit` } })
        } finally {
          setUploadingCover(false)
        }
      }
      // The Tour page it opens says what comes next, so the toast only confirms what happened.
      celebrate({ title: `Đã tạo Tour “${input.name}”`, detail: 'Robot đã được giữ.', action: { label: 'Lịch Tour', to: '/staff/schedule' } })
      navigate(`/staff/manage/tours/${id}`, { replace: true })
    } })
  }
  return <AdminPage>
    <div className="tour-create-page">
    <header className="tour-create-page-heading" aria-label="Chuẩn bị Tour">
    <Link to="/staff/schedule" className="tour-create-back"><ArrowLeft size={14} aria-hidden="true" />Lịch Tour</Link>
    <h1>Tạo Tour</h1>
    <p>{quick
      ? QUICK_TOUR_RULES.pageDescription
      : 'Tour mới ở trạng thái Đang nhận đăng ký: giữ chỗ robot nhưng không tự chạy khi tới giờ. Sau khi tạo, đại diện trường thấy Tour và có thể đăng ký đoàn.'}</p>
    </header>
    <CreateTourForm busy={create.isPending || uploadingCover} error={create.isError ? tourError(create.error, { quick }) : null} onSubmit={submit} />
    </div>
  </AdminPage>
}

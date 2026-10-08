import type { RepresentativeRegistration } from '../../features/representative/api/types'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useRepRegistration, useCancelRegistration } from '../../features/representative/representative-hooks'
import { RepPage, RepPageHeader, Panel, InfoList, Callout, GatedAction, RegistrationStatusBadge, TourStateBadge, ErrorState, PageSkeleton, ConfirmationDialog } from '../../features/representative/components/RepUi'
import { RosterPreview } from '../../features/registrations/RosterPreview'
import { formatDateTime, readRepError } from '../../features/representative/rep-format'

export default function RepRegistrationDetailPage() {
  const { registrationId } = useParams()
  const query = useRepRegistration(registrationId)
  const cancel = useCancelRegistration()
  const [confirm, setConfirm] = useState<RepresentativeRegistration | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  if (query.isPending) return <PageSkeleton />
  if (!query.data) return <RepPage><ErrorState title="Không xem được đăng ký" message={readRepError(query.error).message} back={{ to: '/dai-dien/dang-ky', label: 'Đăng ký của tôi' }} /></RepPage>
  const r = query.data
  const summary = r.summary
  async function onCancel() {
    if (!confirm) return
    try {
      await cancel.mutateAsync({ id: confirm.summary.id, version: confirm.rowVersion, tourVersion: confirm.tourRowVersion })
      setConfirm(null); setMessage('Đã hủy đăng ký.')
    } catch (error) { setConfirm(null); setMessage(readRepError(error).message); void query.refetch() }
  }
  const edit = r.allowedActions.edit.allowed ? r.allowedActions.edit : r.allowedActions.resubmit
  return <RepPage>
    <RepPageHeader back={{ to: '/dai-dien/dang-ky', label: 'Đăng ký của tôi' }} title={summary.groupName} description={summary.tourName}
      badges={<><RegistrationStatusBadge state={summary.state} /><TourStateBadge state={summary.tourState} /></>} />
    {message && <div className="mb-5"><Callout title={message} role="status" /></div>}
    {summary.state === 'APPROVED' && <div className="mb-5"><Callout tone="ok" title="Đăng ký đã được duyệt">Hỗ trợ lời mời riêng và chỉnh sửa sau duyệt sẽ được cung cấp trong bước tiếp theo.</Callout></div>}
    {summary.state === 'REJECTED' && <div className="mb-5"><Callout tone="danger" title="Đăng ký bị từ chối">{r.rejectionReason || 'Không có lý do được lưu.'}</Callout></div>}
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]"><div className="space-y-6">
      <Panel title="Thông tin đoàn"><InfoList items={[
        { label: 'Trường', value: summary.schoolName }, { label: 'Đoàn', value: summary.groupName },
        { label: 'Người liên hệ', value: r.contactName }, { label: 'Email liên hệ', value: r.contactEmail },
        { label: 'Giờ dự kiến', value: formatDateTime(summary.tourScheduledStartAt) },
        { label: 'Gửi đăng ký', value: formatDateTime(summary.submittedAt) },
        { label: 'Cập nhật', value: formatDateTime(summary.updatedAt) },
        { label: 'Admin duyệt', value: r.reviewedAt ? formatDateTime(r.reviewedAt) : '-' },
      ]} /></Panel>
      <Panel title={`Danh sách ${summary.rowCount} lời mời`}><RosterPreview rows={r.roster} /></Panel>
    </div><Panel title="Thao tác"><div className="space-y-5">
      <GatedAction gate={edit} label={summary.state === 'SUBMITTED' ? 'Sửa đăng ký' : summary.state === 'CANCELLED' ? 'Đăng ký lại' : 'Sửa và gửi lại'} to={`/dai-dien/dang-ky/${summary.id}/sua`} kind="primary" />
      <GatedAction gate={r.allowedActions.cancel} label="Hủy đăng ký" kind="danger" onClick={() => setConfirm(r)} />
      <Link to={`/dai-dien/buoi/${summary.tourId}`}>Xem buổi tham quan</Link>
    </div></Panel></div>
    <ConfirmationDialog open={Boolean(confirm)} title="Hủy đăng ký đoàn?" confirmLabel="Xác nhận hủy" busy={cancel.isPending} onClose={() => setConfirm(null)} onConfirm={() => void onCancel()}>
      Đoàn sẽ ngừng chờ duyệt. Bạn có thể đăng ký lại khi buổi còn nhận đăng ký.
    </ConfirmationDialog>
  </RepPage>
}

import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import type { RepresentativeRegistration } from '../api/types'
import { useCancelRegistration, useRepRegistration } from '../representative-hooks'
import { closedNote, formatDateTime, isClosedRegistration, isReviewExpired, readRepError, tourCancelReasonText } from '../rep-format'
import { InvitationPanel } from '../../registrations/invitations/InvitationPanel'
import { repButton } from '../rep-classes'
import { registrationClosesAt } from '../registration-deadline'
import { Callout, ConfirmationDialog, ErrorState, GatedAction, InfoList, Panel, RegistrationStatusBadge, RepPageHeader, TourStateBadge } from './RepUi'
import { RegistrationRows } from './RegistrationRows'
import { RegistrationEmailChanges } from './RegistrationEmailChanges'

const tabs = [{ id: 'info', label: 'Thông tin' }, { id: 'roster', label: 'Danh sách' }, { id: 'invitations', label: 'Lời mời' }, { id: 'email-change', label: 'Đổi email' }]

export function RegistrationDetailContent({ registrationId }: { registrationId: string }) {
  const query = useRepRegistration(registrationId)
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const cancel = useCancelRegistration()
  const [confirm, setConfirm] = useState<RepresentativeRegistration | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelConflict, setCancelConflict] = useState(false)
  const tab = tabs.find(item => item.id === params.get('tab'))?.id ?? 'info'
  const justSent = Boolean((location.state as { justSent?: boolean } | null)?.justSent)
  const link = (id: string, row?: string) => { const next = new URLSearchParams(params); next.set('tab', id); next.set('selected', registrationId); if (row) next.set('row', row); return `${location.pathname}?${next}` }
  async function refresh() { await query.refetch() }
  async function onCancel() {
    if (!confirm || cancelConflict) return
    try {
      await cancel.mutateAsync({ id: confirm.summary.id, version: confirm.rowVersion, tourVersion: confirm.tourRowVersion })
      setConfirm(null); setMessage('Đã hủy đăng ký.')
    } catch (error) {
      const failure = readRepError(error)
      setCancelError(failure.message)
      if (failure.status === 409 || failure.status === 403 || failure.status === 404) { setCancelConflict(true); setConfirm(null); void query.refetch() }
    }
  }
  if (query.isPending) return <p aria-busy="true">Đang tải chi tiết đăng ký…</p>
  if (query.error || !query.data) return <ErrorState title="Không xem được đăng ký" message={readRepError(query.error).message} onRetry={() => void query.refetch()} />
  const r = query.data
  // The detail carries the reason beside its summary, not always inside it.
  const summary = { ...r.summary, rejectionReason: r.rejectionReason ?? r.summary.rejectionReason }
  const reviewExpired = isReviewExpired(summary)
  const tourCancelled = summary.tourState === 'CANCELLED'
  const edit = r.allowedActions.edit.allowed ? r.allowedActions.edit : r.allowedActions.resubmit
  const back = new URLSearchParams(params); back.set('chooser', '1')
  return <div className="rep-stack">
    <RepPageHeader title={summary.groupName} description={`${summary.tourName}, ${summary.schoolName}`} badges={<><RegistrationStatusBadge state={summary.state} rejectionReason={summary.rejectionReason} /><TourStateBadge state={summary.tourState} /></>} back={{ to: `/dai-dien/dang-ky?${back}`, label: 'Danh sách đăng ký' }} />
    <InfoList items={[
      { label: 'Giờ bắt đầu', value: formatDateTime(summary.tourScheduledStartAt) },
      ...(tourCancelled ? [] : [{ label: 'Hạn đăng ký và thêm dòng', value: formatDateTime(registrationClosesAt(summary.tourScheduledStartAt).toISOString()) }]),
    ]} />
    {justSent && <Callout tone="ok" title="Đã gửi đăng ký" role="status">Kết quả xét duyệt sẽ cập nhật ở từng dòng trong danh sách.</Callout>}
    {message && <Callout title={message} role="status" />}
    {cancelError && !confirm && <Callout tone="danger" title={cancelError} role="alert">Kiểm tra dữ liệu mới trước khi mở lại xác nhận hủy.</Callout>}
    {summary.state === 'REJECTED' && !reviewExpired && <Callout tone="danger" title="Đăng ký bị từ chối">{r.rejectionReason || 'Không có lý do được lưu.'}</Callout>}
    {tourCancelled
      ? <Callout tone="danger" title="Buổi tham quan đã bị huỷ">{tourCancelReasonText(summary.tourCancelReason) || 'Nhà trường chưa cung cấp lý do hủy.'}{summary.tourEndedAt && <p>Huỷ lúc {formatDateTime(summary.tourEndedAt)}</p>}</Callout>
      : isClosedRegistration(summary) && <Callout tone="muted" title={closedNote(summary).badge}>{closedNote(summary).reason}</Callout>}
    <nav className="rep-detail-tabs" aria-label="Chi tiết đăng ký">{tabs.map(item => <Link key={item.id} to={link(item.id)} aria-current={tab === item.id ? 'page' : undefined}>{item.label}</Link>)}</nav>
    {tab === 'info' && <>
      <Panel title="Thông tin đăng ký"><InfoList items={[
        { label: 'Trường', value: summary.schoolName }, { label: 'Đoàn', value: summary.groupName },
        { label: 'Người liên hệ', value: r.contactName }, { label: 'Email liên hệ', value: r.contactEmail },
        { label: 'Giờ tham quan', value: formatDateTime(summary.tourScheduledStartAt) }, { label: 'Gửi đăng ký', value: formatDateTime(summary.submittedAt) },
        { label: 'Cập nhật', value: formatDateTime(summary.updatedAt) }, { label: 'Xét duyệt', value: r.reviewedAt ? formatDateTime(r.reviewedAt) : 'Chưa xét duyệt' },
      ]} /></Panel>
      <Callout title="Kết quả được xét theo từng dòng">Đăng ký đã duyệt vẫn có thể có dòng đang chờ hoặc bị từ chối. Xem Danh sách để biết kết quả và lý do; xem Lời mời để kiểm tra quyền truy cập và email.</Callout>
      <Panel title="Thao tác"><div className="rep-inline-actions">
        {!tourCancelled && !reviewExpired && <GatedAction gate={edit} label={r.allowedActions.edit.allowed ? 'Sửa đăng ký' : 'Sửa và gửi lại'} to={`/dai-dien/dang-ky/${summary.id}/sua?${params}`} kind="secondary" />}
        {!tourCancelled && <GatedAction gate={r.allowedActions.cancel} label="Hủy đăng ký" kind="danger" onClick={() => { setCancelConflict(false); setCancelError(null); setConfirm(r) }} />}
        <Link to={`/dai-dien/buoi/${summary.tourId}`} className={repButton('secondary')}>Xem buổi tham quan</Link>
      </div></Panel>
    </>}
    {tab === 'roster' && <Panel title="Kết quả từng dòng"><RegistrationRows registration={r} emailLink={row => link('email-change', row)} /></Panel>}
    {tab === 'invitations' && <div className="rep-invitation-scope"><InvitationPanel registrationId={summary.id} rowVersion={r.rowVersion} tourRowVersion={r.tourRowVersion} variant="representative" /></div>}
    {tab === 'email-change' && <RegistrationEmailChanges registration={r} selectedRow={params.get('row')} refresh={refresh} selectRow={id => { const next = new URLSearchParams(params); next.set('row', id); setParams(next) }} />}
    <ConfirmationDialog open={Boolean(confirm)} title="Hủy đăng ký đoàn?" confirmLabel="Xác nhận hủy" busy={cancel.isPending} onClose={() => setConfirm(null)} onConfirm={() => void onCancel()}>
      <p>Đăng ký và quyền tham gia liên quan sẽ bị hủy theo quy tắc của buổi. Kiểm tra tên đoàn trước khi xác nhận: {confirm?.summary.groupName}.</p>
      {cancelError && <p role="alert">{cancelError} Thử lại giữ nguyên phiên bản đã xác nhận.</p>}
    </ConfirmationDialog>
  </div>
}

import type { RepresentativeRegistration } from '../../features/representative/api/types'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useRepRegistration, useCancelRegistration } from '../../features/representative/representative-hooks'
import { RepPage, RepPageHeader, Panel, InfoList, Callout, GatedAction, RegistrationStatusBadge, TourStateBadge, ErrorState, PageSkeleton, ConfirmationDialog } from '../../features/representative/components/RepUi'
import { RosterPreview } from '../../features/registrations/RosterPreview'
import { InvitationPanel } from '../../features/registrations/invitations/InvitationPanel'
import { RegistrationTrack } from '../../features/representative/components/RegistrationTrack'
import { formatDateTime, groupLabel, readRepError } from '../../features/representative/rep-format'

export default function RepRegistrationDetailPage() {
  const { registrationId } = useParams()
  const query = useRepRegistration(registrationId)
  const cancel = useCancelRegistration()
  const [confirm, setConfirm] = useState<RepresentativeRegistration | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // Set by the registration form right after a new group is sent.
  const justSent = Boolean((useLocation().state as { justSent?: boolean } | null)?.justSent)
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
  const events = [
    { title: 'Bạn gửi đăng ký', text: `${summary.rowCount} dòng lời mời`, at: summary.submittedAt, color: '#87b661' },
    ...(summary.state === 'REJECTED' ? [{ title: 'Admin từ chối', text: r.rejectionReason || 'Không có lý do được lưu.', at: r.reviewedAt ?? summary.updatedAt, color: 'var(--rep-bad)' }]
      : summary.state === 'APPROVED' ? [{ title: 'Admin duyệt đăng ký', text: 'Xem trạng thái email và hỗ trợ mã ở mục Lời mời và email.', at: r.reviewedAt ?? summary.updatedAt, color: '#2c9a5f' }]
      : summary.state === 'CANCELLED' ? [{ title: 'Đăng ký đã hủy', text: 'Đoàn không còn chờ duyệt.', at: summary.updatedAt, color: 'var(--rep-ink-3)' }]
      : [{ title: 'Đang chờ Admin duyệt', text: 'Bạn vẫn có thể sửa danh sách trong lúc chờ.', at: summary.updatedAt, color: '#d39a2c' }]),
  ]
  const group = groupLabel(summary)
  return <RepPage>
    <RepPageHeader back={{ to: '/dai-dien/dang-ky', label: 'Đăng ký của tôi' }} kicker={summary.schoolName} title={summary.groupName} description={summary.tourName}
      badges={<><RegistrationStatusBadge state={summary.state} size="md" /><TourStateBadge state={summary.tourState} size="md" /></>} />
    {justSent && summary.state === 'SUBMITTED' && <div className="rep-sent" role="status" style={{ marginBottom: 24 }}>
      <span className="rep-burst" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return <i key={i} style={{ '--x': `${Math.cos(a) * 120}px`, '--y': `${Math.sin(a) * 80}px` } as React.CSSProperties} /> })}</span>
      <span className="rep-stamp" aria-hidden="true">ĐÃ GỬI</span>
      <small>ĐÃ GỬI ĐĂNG KÝ</small>
      <h2>{group ? `${group}, ${summary.schoolName}` : summary.schoolName}</h2>
      <p>Admin sẽ duyệt danh sách {summary.rowCount} dòng lời mời. Kết quả hiện ở đây và trong Đăng ký của tôi; hỗ trợ gửi lời mời riêng sẽ được cung cấp trong bước tiếp theo.</p>
    </div>}
    {message && <div style={{ marginBottom: 20 }}><Callout title={message} role="status" /></div>}
    {summary.state === 'APPROVED' && <div style={{ marginBottom: 20 }}><InvitationPanel registrationId={summary.id} rowVersion={r.rowVersion} tourRowVersion={r.tourRowVersion} /></div>}
    {summary.state === 'REJECTED' && <div style={{ marginBottom: 20 }}><Callout tone="danger" title="Đăng ký bị từ chối">{r.rejectionReason || 'Không có lý do được lưu.'}</Callout></div>}
    <div className="rep-panel" style={{ padding: '26px 24px 22px', marginBottom: 24 }}><RegistrationTrack state={summary.state} tourState={summary.tourState} /></div>
    <div className="rep-detail"><div className="rep-stack" style={{ minWidth: 0 }}>
      <Panel title="Thông tin đoàn"><InfoList items={[
        { label: 'Trường', value: summary.schoolName }, { label: 'Đoàn', value: summary.groupName },
        { label: 'Người liên hệ', value: r.contactName }, { label: 'Email liên hệ', value: r.contactEmail },
        { label: 'Giờ dự kiến', value: formatDateTime(summary.tourScheduledStartAt) },
        { label: 'Gửi đăng ký', value: formatDateTime(summary.submittedAt) },
        { label: 'Cập nhật', value: formatDateTime(summary.updatedAt) },
        { label: 'Admin duyệt', value: r.reviewedAt ? formatDateTime(r.reviewedAt) : '-' },
      ]} /></Panel>
      <Panel title={`Danh sách ${summary.rowCount} lời mời`}><RosterPreview rows={r.roster} variant="representative" /></Panel>
    </div><aside className="rep-aside" aria-label="Thao tác và lịch sử">
      <h2>Thao tác</h2>
      <GatedAction gate={edit} label={summary.state === 'SUBMITTED' ? 'Sửa đăng ký' : summary.state === 'CANCELLED' ? 'Đăng ký lại' : 'Sửa và gửi lại'} to={`/dai-dien/dang-ky/${summary.id}/sua`} kind="primary" />
      <GatedAction gate={r.allowedActions.cancel} label="Hủy đăng ký" kind="danger" onClick={() => setConfirm(r)} />
      <Link to={`/dai-dien/buoi/${summary.tourId}`} className="rep-text-link" style={{ justifySelf: 'start' }}>Xem buổi tham quan</Link>
      <h2 style={{ marginTop: 8 }}>Lịch sử</h2>
      <ol className="rep-events">{events.map(e => <li key={e.title} style={{ '--rep-event': e.color } as React.CSSProperties}><b>{e.title}</b><p>{e.text}</p><p className="rep-muted num" style={{ fontSize: 12 }}>{formatDateTime(e.at)}</p></li>)}</ol>
    </aside></div>
    <ConfirmationDialog open={Boolean(confirm)} title="Hủy đăng ký đoàn?" confirmLabel="Xác nhận hủy" busy={cancel.isPending} onClose={() => setConfirm(null)} onConfirm={() => void onCancel()}>
      Đoàn sẽ ngừng chờ duyệt. Bạn có thể đăng ký lại khi buổi còn nhận đăng ký.
    </ConfirmationDialog>
  </RepPage>
}

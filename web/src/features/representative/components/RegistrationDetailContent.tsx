import { useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Info, Mail, RefreshCw, Users } from 'lucide-react'
import type { RepresentativeRegistration } from '../api/types'
import { useCancelRegistration, useRepRegistration } from '../representative-hooks'
import { closedNote, formatDateTime, groupLine, isClosedRegistration, isNotOpenError, isReviewExpired, readRepError, tourCancelReasonText } from '../rep-format'
import { InvitationPanel } from '../../registrations/invitations/InvitationPanel'
import { repButton } from '../rep-classes'
import { registrationClosesAt } from '../registration-deadline'
import { Callout, ConfirmationDialog, ErrorState, GatedAction, InfoList, NotOpenState, Panel, RegistrationStatusBadge, RepPageHeader, TourStateBadge } from './RepUi'
import { RegistrationRows } from './RegistrationRows'
import { RegistrationEmailChanges } from './RegistrationEmailChanges'

const tabs = [{ id: 'info', label: 'Thông tin', Icon: Info }, { id: 'roster', label: 'Danh sách', Icon: Users }, { id: 'invitations', label: 'Lời mời', Icon: Mail }, { id: 'email-change', label: 'Đổi email', Icon: RefreshCw }]

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
  const tabsRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const nav = tabsRef.current
    const current = nav?.querySelector('[aria-current="page"]')
    if (!nav || !current) return
    const item = current.getBoundingClientRect(), box = nav.getBoundingClientRect()
    if (item.right > box.right) nav.scrollLeft += item.right - box.right + 8
    else if (item.left < box.left) nav.scrollLeft -= box.left - item.left + 8
  }, [tab, query.data])
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
  if (query.error && isNotOpenError(query.error)) return <NotOpenState title="Đăng ký này không còn mở cho bạn" back={{ to: '/dai-dien/dang-ky', label: 'Xem danh sách đăng ký' }} />
  if (query.error || !query.data) return <ErrorState title="Không xem được đăng ký" message={readRepError(query.error).message} onRetry={() => void query.refetch()} />
  const r = query.data
  // The detail carries the reason beside its summary, not always inside it.
  const summary = { ...r.summary, rejectionReason: r.rejectionReason ?? r.summary.rejectionReason }
  const reviewExpired = isReviewExpired(summary)
  const tourCancelled = summary.tourState === 'CANCELLED'
  // Resubmission is the rejected/cancelled path; any other locked record (READY included) is still an edit.
  const resubmitMode = !r.allowedActions.edit.allowed && (r.allowedActions.resubmit.allowed || summary.state === 'REJECTED' || summary.state === 'CANCELLED')
  const edit = resubmitMode ? r.allowedActions.resubmit : r.allowedActions.edit
  return <div className="rep-stack">
    <RepPageHeader title={summary.tourName} description={[groupLine(summary), summary.schoolName].filter(Boolean).join(', ')}
      badges={tourCancelled ? <RegistrationStatusBadge state={summary.state} tourState={summary.tourState} /> : <><RegistrationStatusBadge state={summary.state} rejectionReason={summary.rejectionReason} /><TourStateBadge state={summary.tourState} /></>} />
    <InfoList items={[
      { label: 'Giờ bắt đầu', value: formatDateTime(summary.tourScheduledStartAt) },
      ...(tourCancelled ? [] : [{ label: 'Hạn đăng ký và thêm dòng', value: formatDateTime(registrationClosesAt({ scheduledStartAt: summary.tourScheduledStartAt, registrationClosesAt: summary.tourRegistrationClosesAt }).toISOString()) }]),
    ]} />
    {message && <Callout title={message} role="status" />}
    {cancelError && !confirm && <Callout tone="danger" title={cancelError} role="alert">Kiểm tra dữ liệu mới trước khi mở lại xác nhận hủy.</Callout>}
    {summary.state === 'REJECTED' && !reviewExpired && <Callout tone="danger" title="Đăng ký bị từ chối">{r.rejectionReason || 'Không có lý do được lưu.'}</Callout>}
    {tourCancelled
      ? <Callout tone="muted" title="Buổi tham quan đã bị hủy">{tourCancelReasonText(summary.tourCancelReason) || 'Đại học FPT chưa cung cấp lý do hủy.'}{summary.tourEndedAt && <p>Hủy lúc {formatDateTime(summary.tourEndedAt)}</p>}</Callout>
      : isClosedRegistration(summary) && <Callout tone="muted" title={closedNote(summary).badge}>{closedNote(summary).reason}</Callout>}
    <nav ref={tabsRef} className="rep-detail-tabs" aria-label="Chi tiết đăng ký">{tabs.map(({ id, label, Icon }) => <Link key={id} to={link(id)} aria-current={tab === id ? 'page' : undefined}><Icon size={16} aria-hidden="true" />{label}</Link>)}</nav>
    <div key={tab} className="rep-stack rep-tab-enter">
    {tab === 'info' && <>
      <Panel title="Thông tin đăng ký"><InfoList items={[
        { label: 'Trường', value: summary.schoolName }, { label: 'Đoàn', value: summary.groupName },
        { label: 'Người liên hệ', value: r.contactName }, { label: 'Email liên hệ', value: r.contactEmail },
        { label: 'Giờ tham quan', value: formatDateTime(summary.tourScheduledStartAt) }, { label: 'Gửi đăng ký', value: formatDateTime(summary.submittedAt) },
        { label: 'Cập nhật', value: formatDateTime(summary.updatedAt) }, { label: 'Xét duyệt', value: r.reviewedAt ? formatDateTime(r.reviewedAt) : 'Chưa xét duyệt' },
      ]} /></Panel>
      <p className="rep-hint">Mỗi dòng được duyệt riêng. <Link to={link('roster')} className="rep-text-link">Xem kết quả từng dòng</Link></p>
      <Panel title="Thao tác"><div className="rep-inline-actions">
        {!tourCancelled && !reviewExpired && <GatedAction gate={edit} label={resubmitMode ? 'Sửa và gửi lại' : 'Sửa đăng ký'} to={`/dai-dien/dang-ky/${summary.id}/sua?${params}`} kind="secondary" />}
        {!tourCancelled && <GatedAction gate={r.allowedActions.cancel} label="Hủy đăng ký" kind="danger" onClick={() => { setCancelConflict(false); setCancelError(null); setConfirm(r) }} />}
        <Link to={`/dai-dien/buoi/${summary.tourId}`} className={repButton('secondary')}>Xem buổi tham quan</Link>
      </div></Panel>
    </>}
    {tab === 'roster' && <Panel title="Kết quả từng dòng"><RegistrationRows registration={r} emailLink={row => link('email-change', row)} /></Panel>}
    {tab === 'invitations' && tourCancelled && <Callout tone="muted" title="Buổi đã hủy, lời mời không còn dùng được." role="status" />}
    {tab === 'invitations' && !tourCancelled && <div className="rep-invitation-scope"><InvitationPanel registrationId={summary.id} rowVersion={r.rowVersion} tourRowVersion={r.tourRowVersion} variant="representative" /></div>}
    {tab === 'email-change' && <RegistrationEmailChanges registration={r} selectedRow={params.get('row')} refresh={refresh} selectRow={id => { const next = new URLSearchParams(params); next.set('row', id); setParams(next) }} />}
    </div><ConfirmationDialog open={Boolean(confirm)} title="Hủy đăng ký đoàn?" confirmLabel="Xác nhận hủy" busy={cancel.isPending} onClose={() => setConfirm(null)} onConfirm={() => void onCancel()}>
      <p>Đăng ký và quyền tham gia liên quan sẽ bị hủy theo quy tắc của buổi. Kiểm tra tên đoàn trước khi xác nhận: {confirm?.summary.groupName}.</p>
      {cancelError && <p role="alert">{cancelError} Thử lại giữ nguyên phiên bản đã xác nhận.</p>}
    </ConfirmationDialog>
  </div>
}

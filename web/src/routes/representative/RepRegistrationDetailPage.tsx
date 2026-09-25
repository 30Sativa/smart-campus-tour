import { useCallback, useState } from 'react'
import { Download } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import type { RepresentativeRegistrationDetail } from '../../api/contracts/representative'
import { buttonClass } from '../../features/staff/ui-classes'
import {
  Callout,
  ConfirmationDialog,
  ErrorState,
  GatedAction,
  InfoList,
  PageSkeleton,
  Panel,
  RegistrationStatusBadge,
  RepPage,
  RepPageHeader,
  Toast,
  TourStateBadge,
} from '../../features/representative/components/RepUi'
import type { ToastMessage } from '../../features/representative/components/RepUi'
import { InvitationPanel } from '../../features/representative/components/InvitationPanel'
import { RosterPreview } from '../../features/representative/components/RosterPreview'
import { useCancelRegistration, useRepRegistration } from '../../features/representative/representative-hooks'
import { formatDate, formatDateTime, formatTime, groupLabel, readRepError } from '../../features/representative/rep-format'
import { downloadBytes, rosterWorkbookBytes } from '../../features/representative/roster-import'

/** The state message at the top: what this state means and the one way forward. */
function StatusCallout({ r }: { r: RepresentativeRegistrationDetail }) {
  const a = r.allowedActions
  if (r.state === 'Submitted') {
    return r.resubmittedAfterApproval ? (
      <Callout tone="warn" title="Danh sách mới đang chờ Admin duyệt lại">
        Mã đoàn tạm thời chưa cấp quyền cho học sinh mới. Học sinh đã ở phòng chờ sẽ thấy "Danh sách đang được cập nhật" cho tới khi Admin duyệt.
      </Callout>
    ) : (
      <Callout tone="warn" title="Đăng ký đang chờ Admin xét duyệt.">
        {a.edit.allowed ? 'Bạn vẫn chỉnh sửa, thay danh sách hoặc hủy được khi buổi còn đang nhận đăng ký. Kết quả duyệt sẽ hiện tại đây.' : 'Kết quả duyệt sẽ hiện tại đây.'}
      </Callout>
    )
  }
  if (r.state === 'Rejected') {
    return (
      <Callout
        tone="danger"
        title="Đăng ký bị từ chối"
        actions={a.edit.allowed ? <Link to={`/dai-dien/dang-ky/${r.id}/sua`} className={buttonClass('primary', 'sm')}>Chỉnh sửa và gửi lại</Link> : undefined}
      >
        <p className="font-semibold text-[#0f172a]">Lý do từ chối</p>
        <p className="mt-0.5">{r.rejectionReason ?? 'Admin không ghi lý do.'}</p>
        {a.edit.allowed && <p className="mt-2 text-[13px] text-[#64748b]">Gửi lại sẽ cập nhật chính đăng ký này và chuyển về Chờ duyệt.</p>}
      </Callout>
    )
  }
  if (r.state === 'Cancelled') {
    return (
      <Callout
        tone="muted"
        title="Đăng ký đã hủy"
        actions={a.reRegister.allowed ? <Link to={`/dai-dien/buoi/${r.tourId}/dang-ky`} className={buttonClass('primary', 'sm')}>Đăng ký lại</Link> : undefined}
      >
        {a.reRegister.allowed ? 'Buổi vẫn nhận đăng ký. Đăng ký lại dùng chính bản ghi này và chờ Admin duyệt lại.' : 'Học sinh không còn vào được bằng mã đoàn của đăng ký này.'}
      </Callout>
    )
  }
  return (
    <Callout tone="ok" title="Đăng ký đã được duyệt">
      {r.participation ? 'Chia sẻ đường dẫn và mã đoàn bên dưới cho học sinh trong danh sách.' : 'Buổi đã kết thúc nên đường dẫn và mã đoàn không còn dùng được.'}
    </Callout>
  )
}

/** Actions that fit this registration state. Refused ones stay visible, disabled, with the reason. */
function Actions({ r, onCancel }: { r: RepresentativeRegistrationDetail; onCancel: () => void }) {
  const a = r.allowedActions
  const locked = r.tourState !== 'Scheduled'
  const lockReason = locked ? a.cancel.reason ?? a.reRegister.reason ?? a.edit.reason : null
  const cancel = <GatedAction gate={a.cancel} label="Hủy đăng ký" kind="danger" onClick={onCancel} showReason={!locked} />

  return (
    <Panel title="Thao tác">
      <div className="space-y-3">
        {lockReason && <p className="rounded-xl bg-[#f8fafc] px-3.5 py-3 text-[13px] leading-relaxed text-[#475569]">{lockReason}</p>}
        {r.state === 'Submitted' && (
          <>
            <GatedAction gate={a.edit} label="Chỉnh sửa đăng ký" kind="primary" to={`/dai-dien/dang-ky/${r.id}/sua`} showReason={!locked} />
            <GatedAction gate={a.edit} label="Thay danh sách học sinh" to={`/dai-dien/dang-ky/${r.id}/sua?buoc=2`} showReason={!locked} />
            {cancel}
          </>
        )}
        {r.state === 'Approved' && (
          <>
            <GatedAction gate={a.replaceRoster} label="Thay danh sách học sinh" to={`/dai-dien/dang-ky/${r.id}/sua`} showReason={!locked} hint="Đăng ký sẽ quay về Chờ duyệt để Admin duyệt lại." />
            {cancel}
          </>
        )}
        {r.state === 'Rejected' && (
          <>
            <GatedAction gate={a.edit} label="Chỉnh sửa và gửi lại" kind="primary" to={`/dai-dien/dang-ky/${r.id}/sua`} showReason={!locked} />
            {cancel}
          </>
        )}
        {r.state === 'Cancelled' && <GatedAction gate={a.reRegister} label="Đăng ký lại" kind="primary" to={`/dai-dien/buoi/${r.tourId}/dang-ky`} showReason={!locked} />}
      </div>
    </Panel>
  )
}

/** My Registration Detail (flow review §4.1): state, reason, invitation, roster, history and the valid actions. */
export default function RepRegistrationDetailPage() {
  const { registrationId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const query = useRepRegistration(registrationId)
  const cancel = useCancelRegistration()
  const flashText = (location.state as { flash?: string } | null)?.flash
  const [toast, setToast] = useState<ToastMessage | null>(flashText ? { text: flashText } : null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const clearToast = useCallback(() => {
    setToast(null)
    if (location.state) navigate('.', { replace: true, state: null })
  }, [navigate, location.state])

  if (query.isLoading) return <PageSkeleton label="Đang tải đăng ký" />
  if (query.isError || !query.data) {
    return (
      <RepPage>
        <ErrorState title="Không mở được đăng ký" message={readRepError(query.error).message} back={{ to: '/dai-dien/dang-ky', label: 'Về đăng ký của tôi' }} />
      </RepPage>
    )
  }

  const r = query.data
  const group = groupLabel(r)

  const doCancel = () => {
    cancel.mutate(
      { id: r.id, version: r.version },
      {
        onSuccess: () => {
          setConfirmCancel(false)
          setToast({ text: 'Đã hủy đăng ký. Học sinh không còn vào được bằng mã đoàn này.' })
        },
        onError: (e) => {
          setConfirmCancel(false)
          setToast({ text: `${readRepError(e).message} Trang đã tải lại trạng thái mới nhất.`, tone: 'danger' })
        },
      },
    )
  }

  return (
    <RepPage>
      <RepPageHeader
        back={{ to: '/dai-dien/dang-ky', label: 'Đăng ký của tôi' }}
        badges={<><RegistrationStatusBadge state={r.state} size="md" /><TourStateBadge state={r.tourState} size="md" /></>}
        title={r.tourName}
        description={`${group ? `${group}, ` : ''}${r.schoolName}. Gửi lần gần nhất lúc ${formatDateTime(r.submittedAt)}.`}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <StatusCallout r={r} />

          {r.participation && <InvitationPanel registration={r} onCopied={(what) => setToast({ text: `Đã sao chép ${what}.` })} />}

          <Panel title="Buổi tham quan" action={<Link to={`/dai-dien/buoi/${r.tourId}`} className={buttonClass('ghost', 'sm')}>Xem thông tin buổi</Link>}>
            <InfoList items={[
              { label: 'Tên buổi', value: r.tourName },
              { label: 'Mã buổi', value: r.tourCode },
              { label: 'Ngày', value: formatDate(r.tourScheduledAt) },
              { label: 'Giờ bắt đầu dự kiến', value: formatTime(r.tourScheduledAt) },
            ]} />
          </Panel>

          <Panel title="Thông tin đoàn">
            <InfoList items={[
              { label: 'Trường / đơn vị', value: r.schoolName },
              { label: 'Đoàn / lớp', value: group ?? <span className="font-normal text-[#94a3b8]">Không có</span> },
              { label: 'Người đại diện', value: r.representativeName },
              { label: 'Email liên hệ', value: r.contactEmail },
            ]} />
            {r.state === 'Approved' && <p className="mt-4 text-[13px] text-[#64748b]">Đăng ký đã duyệt: muốn đổi email hoặc thông tin đoàn, vui lòng liên hệ Admin.</p>}
          </Panel>

          <Panel
            title={`Danh sách học sinh (${r.studentCount})`}
            action={
              <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => downloadBytes(`CampusTour-${r.tourCode}-danh-sach.xlsx`, rosterWorkbookBytes(r.roster))}>
                <Download size={15} aria-hidden="true" />Tải về Excel
              </button>
            }
          >
            <p className="mb-4 text-sm text-[#64748b]">{r.withClassCount} / {r.studentCount} dòng có lớp. Học sinh nhập đúng họ tên và lớp (nếu dòng có lớp) khi vào phiên.</p>
            <RosterPreview rows={r.roster} />
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Actions r={r} onCancel={() => setConfirmCancel(true)} />
          <Panel title="Lịch sử">
            <ol className="space-y-4">
              {[...r.history].reverse().map((h, i) => (
                <li key={`${h.at}-${i}`} className="relative pl-5">
                  <span aria-hidden="true" className={`absolute top-1.5 left-0 size-2 rounded-full ${i === 0 ? 'bg-[#2563eb]' : 'bg-[#cbd5e1]'}`} />
                  <p className="text-sm text-[#0f172a]">{h.text}</p>
                  <time className="text-xs text-[#94a3b8]" dateTime={h.at}>{formatDateTime(h.at)}</time>
                </li>
              ))}
            </ol>
          </Panel>
        </aside>
      </div>

      <ConfirmationDialog
        open={confirmCancel}
        title="Hủy đăng ký này?"
        confirmLabel="Hủy đăng ký"
        cancelLabel="Giữ đăng ký"
        busy={cancel.isPending}
        onConfirm={doCancel}
        onClose={() => setConfirmCancel(false)}
      >
        <p>
          Đoàn {group ? `${group}, ` : ''}{r.schoolName} sẽ không còn trong buổi {r.tourName}.
          {r.state === 'Approved' ? ' Học sinh đang giữ mã đoàn sẽ không vào được nữa.' : ''} Bạn có thể đăng ký lại khi buổi còn nhận đăng ký; khi đó Admin phải duyệt lại.
        </p>
      </ConfirmationDialog>
      <Toast message={toast} onDone={clearToast} />
    </RepPage>
  )
}

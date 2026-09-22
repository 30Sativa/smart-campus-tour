import { useState } from 'react'
import { Link } from 'react-router'
import { Mail, RefreshCcw } from 'lucide-react'
import { ConfirmationDialog, Drawer } from '../../staff/components/ConfirmationDialog'
import { Field } from '../../staff/StaffUi'
import { buttonClass } from '../../staff/ui-classes'
import { formatSlot, formatStamp } from '../admin-format'
import { isStale, readAdminError } from '../admin-status'
import { useAdminRegistration, useReviewRegistration } from '../admin-hooks'
import { InvitationStatus, Notice, RegistrationStateBadge, TourStateBadge } from '../AdminUi'
import { CopyButton, InvitationDialog } from './InvitationDialog'
import { RosterTable } from './RegistrationParts'

const STALE_TEXT = 'Danh sách đã được cập nhật. Vui lòng tải lại dữ liệu trước khi duyệt.'

/**
 * Review one group (UC-03): who they are, the roster as submitted, and the
 * decision. The decision carries the version the reviewer is looking at; if
 * the representative replaced the roster meanwhile, the server refuses and
 * the drawer asks for a reload instead of approving a list nobody has seen.
 */
export function RegistrationReviewDrawer({ registrationId, onClose }: { registrationId: string | null; onClose: () => void }) {
  const query = useAdminRegistration(registrationId)
  const review = useReviewRegistration()
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null)
  const [stale, setStale] = useState(false)
  const [inviting, setInviting] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)
  const reg = query.data

  const close = () => {
    setConfirm(null)
    setStale(false)
    review.reset()
    onClose()
  }

  const reload = async () => {
    setReloading(true)
    try {
      await query.refetch()
      setStale(false)
      review.reset()
    } finally {
      setReloading(false)
    }
  }

  const decide = (decision: 'approve' | 'reject', reason: string) => {
    if (!reg) return
    review.mutate(
      { id: reg.id, decision, version: reg.version, reason },
      {
        onSuccess: () => {
          setConfirm(null)
          void query.refetch()
        },
        onError: (error) => {
          if (isStale(error)) {
            setConfirm(null)
            setStale(true)
          }
        },
      },
    )
  }

  const reviewError = review.isError && !isStale(review.error) ? readAdminError(review.error).message : null
  const canDecide = Boolean(reg?.allowedActions.approve.allowed) && !stale

  return (
    <>
      <Drawer
        open={Boolean(registrationId)}
        wide
        title={reg ? reg.schoolName : 'Đăng ký đoàn'}
        description={reg ? `${reg.tourCode} · ${reg.tourName} · ${formatSlot(reg.tourScheduledAt)}` : undefined}
        onClose={close}
        footer={
          reg && reg.state === 'Submitted' ? (
            canDecide ? (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setConfirm('reject')} className={buttonClass('danger')}>Từ chối</button>
                <button type="button" onClick={() => setConfirm('approve')} className={buttonClass('primary')}>Duyệt đăng ký</button>
              </div>
            ) : (
              <p className="text-sm text-[#64748b]">{stale ? 'Tải lại dữ liệu để tiếp tục duyệt.' : reg.allowedActions.approve.reason}</p>
            )
          ) : undefined
        }
      >
        {query.isLoading && <div className="space-y-3" aria-busy="true" aria-label="Đang tải đăng ký">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-[#f1f5f9]" />)}</div>}
        {query.isError && <Notice tone="danger" action={<button type="button" onClick={() => void query.refetch()} className={buttonClass('secondary', 'sm')}>Thử lại</button>}>Không tải được đăng ký này.</Notice>}
        {reg && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <RegistrationStateBadge state={reg.state} />
              <span className="text-xs text-[#94a3b8]">Tour:</span>
              <TourStateBadge state={reg.tourState} />
              <Link to={`/admin/tours/${reg.tourId}?tab=registrations`} onClick={close} className="text-xs font-bold text-[#2563eb] hover:underline">Mở Tour</Link>
            </div>

            {stale && (
              <Notice tone="warn" action={<button type="button" onClick={reload} disabled={reloading} className={buttonClass('secondary', 'sm')}><RefreshCcw size={14} aria-hidden="true" />{reloading ? 'Đang tải…' : 'Tải lại'}</button>}>
                {STALE_TEXT}
              </Notice>
            )}
            {reg.state === 'Submitted' && reg.resubmittedAfterApproval && <Notice tone="warn">Danh sách đã được cập nhật và cần duyệt lại.</Notice>}
            {reg.state === 'Rejected' && reg.rejectionReason && <Notice tone="danger"><span className="font-bold">Lý do từ chối:</span> {reg.rejectionReason}</Notice>}
            {reg.state === 'Cancelled' && <Notice>Đại diện đã hủy đăng ký này; đoàn không còn quyền vào phiên.</Notice>}
            {reviewError && <Notice tone="danger">{reviewError}</Notice>}

            <dl className="grid grid-cols-1 gap-4 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4 sm:grid-cols-2">
              <Field label="Đại diện">{reg.representativeName}</Field>
              <Field label="Email liên hệ"><span className="[overflow-wrap:anywhere]">{reg.contactEmail}</span></Field>
              <Field label="Số học sinh">{reg.studentCount}</Field>
              <Field label="Gửi lúc">{formatStamp(reg.submittedAt)}</Field>
              {reg.reviewedAt && <Field label={reg.state === 'Rejected' ? 'Từ chối lúc' : 'Duyệt lúc'}>{formatStamp(reg.reviewedAt)}{reg.reviewedBy ? ` · ${reg.reviewedBy}` : ''}</Field>}
            </dl>

            {reg.state === 'Approved' && (
              <section className="rounded-xl border border-[#e2e8f0] p-4" aria-label="Thông tin tham gia">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[#1e293b]">Thông tin tham gia</p>
                    <div className="mt-1"><InvitationStatus registration={reg} /></div>
                  </div>
                  {reg.allowedActions.sendInvitation.allowed ? (
                    <button type="button" onClick={() => setInviting(reg.id)} className={buttonClass(reg.invitationSentAt && !reg.invitationFailed ? 'secondary' : 'primary', 'sm')}>
                      <Mail size={14} aria-hidden="true" />{reg.invitationSentAt || reg.invitationFailed ? 'Gửi lại' : 'Gửi thông tin'}
                    </button>
                  ) : (
                    <p className="text-xs text-[#94a3b8]">{reg.allowedActions.sendInvitation.reason}</p>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-[#334155]">
                  <span>Mã đoàn: <span className="font-mono font-bold tracking-wider">{reg.groupCode}</span></span>
                  <CopyButton value={reg.joinLink} label="Copy link" />
                  <CopyButton value={reg.groupCode} label="Copy mã đoàn" />
                </div>
              </section>
            )}

            <RosterTable roster={reg.roster} />
          </div>
        )}
      </Drawer>

      {reg && (
        <ConfirmationDialog
          key={`approve-${reg.id}-${reg.version}`}
          open={confirm === 'approve'}
          title={`Duyệt ${reg.schoolName}?`}
          description={
            <>
              Duyệt danh sách <strong>{reg.studentCount} học sinh</strong> bạn đang xem. Đoàn sẽ được gửi thông tin tham gia. Việc duyệt <strong>không</strong> chốt Tour: Tour vẫn Đang chuẩn bị cho đến khi bạn Chốt Tour.
            </>
          }
          confirmLabel="Duyệt"
          busyLabel="Đang duyệt…"
          withReason={false}
          busy={review.isPending}
          error={reviewError}
          onConfirm={() => decide('approve', '')}
          onCancel={() => setConfirm(null)}
        />
      )}
      {reg && (
        <ConfirmationDialog
          key={`reject-${reg.id}-${reg.version}`}
          open={confirm === 'reject'}
          title={`Từ chối ${reg.schoolName}?`}
          description="Đại diện sẽ thấy lý do, sửa danh sách rồi gửi lại. Khi gửi lại, đăng ký quay về Chờ duyệt."
          confirmLabel="Từ chối"
          busyLabel="Đang từ chối…"
          tone="danger"
          requireReason
          reasonLabel="Lý do từ chối"
          reasonPlaceholder="Ví dụ: File thiếu cột Lớp cho một số học sinh…"
          busy={review.isPending}
          error={reviewError}
          onConfirm={(reason) => decide('reject', reason)}
          onCancel={() => setConfirm(null)}
        />
      )}
      <InvitationDialog registrationId={inviting} onClose={() => { setInviting(null); void query.refetch() }} />
    </>
  )
}

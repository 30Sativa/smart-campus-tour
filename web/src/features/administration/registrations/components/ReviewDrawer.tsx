import { useState } from 'react'
import { ConfirmationDialog } from '../../../../components/ui/ConfirmationDialog'
import { Field } from '../../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../../components/ui/ui-classes'
import { RosterPreview } from '../../../registrations/RosterPreview'
import { Drawer } from '../../components/Drawer'
import { Notice } from '../../AdminUi'
import { useRegistrationReview, useReviewDecision } from '../hooks'
import { reviewError } from '../errors'
import { reviewTime } from '../presentation'
import { ReviewStateBadge } from './ReviewStateBadge'
import { InvitationPanel } from '../../../registrations/invitations/InvitationPanel'

export function ReviewDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useRegistrationReview(id)
  const mutation = useReviewDecision()
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null)
  const [needsReload, setNeedsReload] = useState(false)
  const [saved, setSaved] = useState(false)
  const reg = query.data
  const error = mutation.isError ? reviewError(mutation.error) : null
  const canReview = reg?.review.allowed && !needsReload && !saved && !query.isFetching && !query.isError && !mutation.isPending
  const reload = async () => {
    const result = await query.refetch()
    if (!result.isError) { setNeedsReload(false); setSaved(false); mutation.reset() }
  }
  const decide = (reason: string) => {
    if (!reg || !confirm || !canReview) return
    mutation.mutate({ id, decision: confirm, input: { expectedRowVersion: reg.rowVersion, expectedTourRowVersion: reg.tourRowVersion,
      ...(confirm === 'reject' ? { reason } : {}) } }, {
      onSuccess: () => { setConfirm(null); setSaved(true); void query.refetch() },
      onError: failure => { if (reviewError(failure).reload) { setConfirm(null); setNeedsReload(true) } },
    })
  }
  const close = () => { if (!mutation.isPending) onClose() }
  return <>
    <Drawer open wide title={reg?.summary.groupName ?? 'Đăng ký đoàn'} description={reg ? `${reg.summary.tourName} · ${reviewTime(reg.summary.tourScheduledStartAt)}` : undefined}
      onClose={close} footer={reg && <div className="flex flex-wrap items-center justify-end gap-2">
        {canReview ? <><button className={buttonClass('danger')} onClick={() => setConfirm('reject')}>Từ chối</button><button className={buttonClass('primary')} onClick={() => setConfirm('approve')}>Duyệt đăng ký</button></>
          : <p className="text-sm text-slate-600">{needsReload ? 'Tải lại dữ liệu để tiếp tục xét duyệt.' : saved ? 'Đã lưu quyết định.' : reg.review.reason}</p>}
      </div>}>
      {query.isLoading && <p aria-busy="true">Đang tải đăng ký…</p>}
      {query.isError && <Notice tone="danger" action={<button className={buttonClass('secondary', 'sm')} onClick={() => void reload()}>Thử lại</button>}>Không tải được đăng ký này.</Notice>}
      {needsReload && <Notice tone="warn" action={<button className={buttonClass('secondary', 'sm')} disabled={query.isFetching} onClick={() => void reload()}>Tải lại</button>}>Dữ liệu đã thay đổi hoặc Tour đã khóa. Tải lại và xem danh sách trước khi quyết định.</Notice>}
      {error && <Notice tone="danger">{error.message}{error.fields.length > 0 && <ul className="mt-2 list-disc pl-5">{[...new Set(error.fields)].map(value => <li key={value}>{value}</li>)}</ul>}</Notice>}
      {reg && !query.isError && <div className="mt-4 space-y-5">
        <ReviewStateBadge state={reg.summary.state} />
        {saved && <p role="status" className="text-sm text-emerald-700">Quyết định đã được lưu.</p>}
        {reg.rejectionReason && <Notice tone="danger">Lý do từ chối: {reg.rejectionReason}</Notice>}
        <dl className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <Field label="Trường">{reg.summary.schoolName}</Field><Field label="Đại diện đăng ký">{reg.summary.representativeName}</Field>
          <Field label="Người liên hệ">{reg.contactName}</Field><Field label="Email liên hệ"><span className="break-all">{reg.contactEmail}</span></Field>
          <Field label="Số dòng lời mời">{reg.summary.rowCount}</Field><Field label="Gửi lúc">{reviewTime(reg.summary.submittedAt)}</Field>
          {reg.reviewedAt && <Field label="Xét duyệt lúc">{reviewTime(reg.reviewedAt)}</Field>}
        </dl>
        {reg.summary.state === 'APPROVED' && <InvitationPanel registrationId={id} rowVersion={reg.rowVersion} tourRowVersion={reg.tourRowVersion} />}
        <p className="text-sm text-slate-600">Điểm xem chung ghi người phụ trách màn hình; số dòng không phải số học sinh tham dự.</p>
        <RosterPreview rows={reg.roster} label="Roster đăng ký" />
      </div>}
    </Drawer>
    {reg && <ConfirmationDialog key={`${id}-${reg.rowVersion}-${confirm}`} open={confirm !== null} title={confirm === 'reject' ? `Từ chối ${reg.summary.groupName}?` : `Duyệt ${reg.summary.groupName}?`}
      description={confirm === 'reject' ? 'Đại diện sẽ thấy lý do, sửa đăng ký và gửi lại để xét duyệt.' : `Duyệt ${reg.summary.rowCount} dòng lời mời đang hiển thị. Hệ thống sẽ cấp mã và gửi email riêng khi hỗ trợ lời mời được bật. Gửi email lỗi vẫn giữ đăng ký đã duyệt.`}
      confirmLabel={confirm === 'reject' ? 'Từ chối' : 'Duyệt'} busyLabel="Đang lưu…" tone={confirm === 'reject' ? 'danger' : 'default'}
      withReason={confirm === 'reject'} requireReason reasonLabel="Lý do từ chối" reasonPlaceholder="Nêu thông tin cần đại diện sửa." busy={mutation.isPending}
      error={error?.message} onConfirm={decide} onCancel={() => { if (!mutation.isPending) setConfirm(null) }} />}
  </>
}

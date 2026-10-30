import { useState } from 'react'
import { ConfirmationDialog } from '../../../../components/ui/ConfirmationDialog'
import { notify } from '../../../../components/ui/toast-store'
import { Field } from '../../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../../components/ui/ui-classes'
import { RosterPreview } from '../../../registrations/RosterPreview'
import { Drawer } from '../../components/Drawer'
import { Notice } from '../../AdminUi'
import { useRegistrationReview, useReviewDecision } from '../hooks'
import type { ReviewRosterRow } from '../types'
import { reviewError } from '../errors'
import { reviewTime } from '../presentation'
import { ReviewStateBadge } from './ReviewStateBadge'
import { InvitationPanel } from '../../../registrations/invitations/InvitationPanel'

type Decision = { action: 'accept' | 'reject'; row: ReviewRosterRow }
const rowState: Record<ReviewRosterRow['participationState'], string> = {
  PENDING: 'Chờ xét duyệt', ACCEPTED: 'Đã chấp nhận', REJECTED: 'Đã từ chối',
}

export function ReviewDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useRegistrationReview(id)
  const mutation = useReviewDecision()
  const [confirm, setConfirm] = useState<Decision | null>(null)
  const [needsReload, setNeedsReload] = useState(false)
  const [snapshotRefreshing, setSnapshotRefreshing] = useState(false)
  const [savedRowId, setSavedRowId] = useState<string | null>(null)
  const reg = query.data
  const error = mutation.isError ? reviewError(mutation.error) : null
  const canWrite = !needsReload && !snapshotRefreshing && !query.isFetching && !query.isError && !mutation.isPending
  const reload = async () => {
    setSnapshotRefreshing(true)
    try {
      const result = await query.refetch()
      if (!result.isError) { setNeedsReload(false); setSavedRowId(null); mutation.reset() }
    } finally { setSnapshotRefreshing(false) }
  }
  const decide = async (reason: string) => {
    if (!reg || !confirm || !canWrite) return
    const selected = confirm
    try {
      await mutation.mutateAsync({ registrationId: id, rowId: selected.row.id, decision: selected.action, input: {
        requestId: crypto.randomUUID(), expectedRegistrationRowVersion: reg.rowVersion,
        expectedTourRowVersion: reg.tourRowVersion, expectedRowVersion: selected.row.rowVersion,
        ...(selected.action === 'reject' ? { reason } : {}),
      } })
      setConfirm(null)
      setSavedRowId(selected.row.id)
      notify(selected.action === 'reject'
        ? { tone: 'info', title: `Đã từ chối ${selected.row.displayName}`, detail: `${reg.summary.groupName} · lý do đã được ghi lại.` }
        : { title: `Đã chấp nhận ${selected.row.displayName}`, detail: `${reg.summary.groupName} · ${reg.summary.tourName}` })
      setSnapshotRefreshing(true)
      try {
        const refreshed = await query.refetch()
        if (refreshed.isError) setNeedsReload(true)
      } finally { setSnapshotRefreshing(false) }
    } catch (failure) {
      if (reviewError(failure).reload) { setConfirm(null); setNeedsReload(true) }
    }
  }
  const close = () => { if (!mutation.isPending) onClose() }
  return <>
    <Drawer open wide title={reg?.summary.groupName ?? 'Đăng ký đoàn'} description={reg ? `${reg.summary.tourName} · ${reviewTime(reg.summary.tourScheduledStartAt)}` : undefined}
      onClose={close} footer={reg && needsReload && <div className="flex justify-end"><p className="text-sm text-slate-600">Tải lại dữ liệu và xem snapshot mới trước khi xét duyệt tiếp.</p></div>}>
      {query.isLoading && <p aria-busy="true">Đang tải đăng ký…</p>}
      {query.isError && <Notice tone="danger" action={<button className={buttonClass('secondary', 'sm')} onClick={() => void reload()}>Thử lại</button>}>Không tải được đăng ký này.</Notice>}
      {savedRowId && <Notice tone="success">Quyết định cho dòng đã được lưu. Kết quả gửi email (nếu có) được theo dõi riêng.</Notice>}
      {needsReload && <Notice tone="warn" action={<button className={buttonClass('secondary', 'sm')} disabled={query.isFetching} onClick={() => void reload()}>Tải lại</button>}>Dữ liệu đã thay đổi hoặc Tour đã khóa. Quyết định chưa được gửi lại. Tải lại và xem snapshot mới trước khi tiếp tục.</Notice>}
      {error && <Notice tone="danger">{error.message}{error.fields.length > 0 && <ul className="mt-2 list-disc pl-5">{[...new Set(error.fields)].map(value => <li key={value}>{value}</li>)}</ul>}</Notice>}
      {reg && !query.isError && <div className="mt-4 space-y-5">
        <ReviewStateBadge state={reg.summary.state} />
        {reg.rejectionReason && <Notice tone="danger">Lý do từ chối: {reg.rejectionReason}</Notice>}
        <dl className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <Field label="Trường">{reg.summary.schoolName}</Field><Field label="Đại diện đăng ký">{reg.summary.representativeName}</Field>
          <Field label="Người liên hệ">{reg.contactName}</Field><Field label="Email liên hệ"><span className="break-all">{reg.contactEmail}</span></Field>
          <Field label="Số dòng lời mời">{reg.summary.rowCount}</Field><Field label="Gửi lúc">{reviewTime(reg.summary.submittedAt)}</Field>
          {reg.reviewedAt && <Field label="Xét duyệt lúc">{reviewTime(reg.reviewedAt)}</Field>}
        </dl>
        {reg.summary.state === 'APPROVED' && <InvitationPanel registrationId={id} rowVersion={reg.rowVersion} tourRowVersion={reg.tourRowVersion} />}
        <p className="text-sm text-slate-600">Điểm xem chung ghi người phụ trách màn hình; số dòng không phải số học sinh tham dự.</p>
        <p className="text-sm text-slate-600">Yêu cầu đổi email cần quy trình gửi và xét duyệt riêng; chức năng này chưa được triển khai.</p>
        <RosterPreview rows={reg.roster} label="Roster đăng ký" rowAction={row => <div className="space-y-2">
          <p className="font-medium text-slate-700">{rowState[row.participationState]}</p>
          {row.reviewReason && <p className="text-xs text-slate-500">{row.reviewReason}</p>}
          {row.participationState === 'PENDING' && (row.canApprove && row.canReject
            ? <div className="flex flex-wrap gap-2"><button className={buttonClass('primary', 'sm')} disabled={!canWrite} onClick={() => setConfirm({ action: 'accept', row })}>Chấp nhận <span className="sr-only">{row.displayName}</span></button>
              <button className={buttonClass('danger', 'sm')} disabled={!canWrite} onClick={() => setConfirm({ action: 'reject', row })}>Từ chối <span className="sr-only">{row.displayName}</span></button></div>
            : <p className="text-xs text-slate-500">{needsReload ? 'Cần tải lại snapshot.' : reg.summary.tourState !== 'SCHEDULED' ? 'Tour không mở xét duyệt.' : 'Không có quyền xét duyệt dòng này.'}</p>)}
        </div>} />
        <button className={buttonClass('secondary', 'sm')} disabled={!canWrite} onClick={() => void reload()}>Tải lại đăng ký</button>
      </div>}
    </Drawer>
    {reg && confirm && <ConfirmationDialog key={`${id}-${reg.rowVersion}-${confirm.row.rowVersion}-${confirm.action}`} open title={confirm.action === 'reject' ? `Từ chối dòng ${confirm.row.displayName}?` : `Chấp nhận dòng ${confirm.row.displayName}?`}
      description={confirm.action === 'reject' ? 'Chỉ dòng này bị từ chối. Đại diện sẽ thấy lý do để sửa thông tin.' : 'Chỉ dòng này được chấp nhận. Việc phát hành lời mời và gửi email được xử lý riêng.'}
      confirmLabel={confirm.action === 'reject' ? 'Từ chối dòng' : 'Chấp nhận dòng'} busyLabel="Đang lưu…" tone={confirm.action === 'reject' ? 'danger' : 'default'}
      withReason={confirm.action === 'reject'} requireReason reasonLabel="Lý do từ chối" reasonPlaceholder="Nêu thông tin cần đại diện sửa." busy={mutation.isPending}
      error={error?.message} onConfirm={reason => void decide(reason)} onCancel={() => { if (!mutation.isPending) setConfirm(null) }} />}
  </>
}

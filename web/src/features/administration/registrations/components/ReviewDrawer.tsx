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

type Decision = { action: 'accept' | 'reject'; rows: ReviewRosterRow[] }
type Tab = 'roster' | 'invitations'
const rowState: Record<ReviewRosterRow['participationState'], string> = {
  PENDING: 'Chờ xét duyệt', ACCEPTED: 'Đã chấp nhận', REJECTED: 'Đã từ chối', EXPIRED: 'Đã hết hạn',
}
const tabClass = (active: boolean) => `rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${active ? 'bg-[#eff6ff] text-[#2563eb]' : 'text-[#64748b] hover:bg-[#f1f5f9]'}`

export function ReviewDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useRegistrationReview(id)
  const mutation = useReviewDecision()
  const [confirm, setConfirm] = useState<Decision | null>(null)
  const [needsReload, setNeedsReload] = useState(false)
  const [snapshotRefreshing, setSnapshotRefreshing] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [chosenTab, setChosenTab] = useState<Tab | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const reg = query.data
  const error = mutation.isError ? reviewError(mutation.error) : null
  const canWrite = !needsReload && !snapshotRefreshing && !query.isFetching && !query.isError && !mutation.isPending && !progress
  const reload = async () => {
    setSnapshotRefreshing(true)
    try {
      const result = await query.refetch()
      if (!result.isError) { setNeedsReload(false); mutation.reset() }
    } finally { setSnapshotRefreshing(false) }
  }
  const reportDone = (action: Decision['action'], done: number, rows: ReviewRosterRow[]) => {
    if (!reg || done === 0) return
    const verb = action === 'reject' ? 'từ chối' : 'chấp nhận'
    const name = rows.length === 1 ? rows[0].displayName : `${done} dòng`
    notify(done < rows.length ? { tone: 'info', title: `Đã ${verb} ${done} trong ${rows.length} dòng`, detail: 'Các dòng còn lại chưa được lưu.' }
      : action === 'reject' ? { tone: 'info', title: `Đã từ chối ${name}`, detail: `${reg.summary.groupName} · lý do đã được ghi lại.` }
      : { title: `Đã chấp nhận ${name}`, detail: `${reg.summary.groupName} · ${reg.summary.tourName}` })
  }
  // The API decides one row at a time and every decision moves the registration version,
  // so each row is sent against a fresh read, in order, and the run stops at the first problem.
  const decide = async (reason: string) => {
    if (!reg || !confirm || !canWrite) return
    const { action, rows } = confirm
    let snapshot = reg
    let done = 0
    setProgress({ done, total: rows.length })
    try {
      for (const target of rows) {
        const row = snapshot.roster.find(item => item.id === target.id)
        // Only the row just decided may move; anything else was not what the reviewer saw.
        if (row?.rowVersion !== target.rowVersion) { setConfirm(null); setNeedsReload(true); break }
        await mutation.mutateAsync({ registrationId: id, rowId: row.id, decision: action, input: {
          requestId: crypto.randomUUID(), expectedRegistrationRowVersion: snapshot.rowVersion,
          expectedTourRowVersion: snapshot.tourRowVersion, expectedRowVersion: row.rowVersion,
          ...(action === 'reject' ? { reason } : {}),
        } })
        done += 1
        setProgress({ done, total: rows.length })
        const refreshed = await query.refetch()
        if (refreshed.isError || !refreshed.data) { setConfirm(null); setNeedsReload(true); break }
        snapshot = refreshed.data
      }
      setConfirm(null)
      setSelected(new Set())
    } catch (failure) {
      if (reviewError(failure).reload) { setConfirm(null); setNeedsReload(true) }
      else if (done > 0) setConfirm(null)
    } finally {
      setProgress(null)
      reportDone(action, done, rows)
    }
  }
  const close = () => { if (!mutation.isPending && !progress) onClose() }
  const openRows = reg?.roster.filter(row => row.participationState === 'PENDING') ?? []
  const selectable = openRows.filter(row => row.canApprove && row.canReject)
  const chosen = selectable.filter(row => selected.has(row.id))
  const allChosen = selectable.length > 0 && chosen.length === selectable.length
  const toggle = (rowId: string) => setSelected(value => {
    const next = new Set(value)
    if (!next.delete(rowId)) next.add(rowId)
    return next
  })
  const showInvitations = reg?.summary.state === 'APPROVED'
  const tab: Tab = showInvitations ? chosenTab ?? (openRows.length > 0 ? 'roster' : 'invitations') : 'roster'
  const count = (state: ReviewRosterRow['participationState']) => reg?.roster.filter(row => row.participationState === state).length ?? 0
  const bulk = (confirm?.rows.length ?? 0) > 1
  const names = confirm?.rows.map(row => row.displayName).join(', ')
  return <>
    <Drawer open wide="xl" title={reg?.summary.groupName ?? 'Đăng ký đoàn'} description={reg ? `${reg.summary.tourName} · ${reviewTime(reg.summary.tourScheduledStartAt)}` : undefined}
      onClose={close} footer={reg && needsReload && <div className="flex justify-end"><p className="text-sm text-slate-600">Tải lại dữ liệu và xem thông tin mới nhất trước khi xét duyệt tiếp.</p></div>}>
      {query.isLoading && <p aria-busy="true">Đang tải đăng ký…</p>}
      {query.isError && <Notice tone="danger" action={<button className={buttonClass('secondary', 'sm')} onClick={() => void reload()}>Thử lại</button>}>Không tải được đăng ký này.</Notice>}
      {needsReload && <Notice tone="warn" action={<button className={buttonClass('secondary', 'sm')} disabled={query.isFetching} onClick={() => void reload()}>Tải lại</button>}>Dữ liệu đã thay đổi hoặc Tour đã khóa. Quyết định chưa được gửi lại. Tải lại và xem thông tin mới nhất trước khi tiếp tục.</Notice>}
      {error && <Notice tone="danger">{error.message}{error.fields.length > 0 && <ul className="mt-2 list-disc pl-5">{[...new Set(error.fields)].map(value => <li key={value}>{value}</li>)}</ul>}</Notice>}
      {reg && !query.isError && <div className="mt-1 space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#475569]">
          <ReviewStateBadge state={reg.summary.state} />
          <span>{count('PENDING')} chờ duyệt · {count('ACCEPTED')} đã chấp nhận · {count('REJECTED')} đã từ chối</span>
        </div>
        {reg.rejectionReason && <Notice tone="danger">Lý do từ chối: {reg.rejectionReason}</Notice>}
        <details className="rounded-xl border border-slate-200 bg-slate-50 text-sm">
          <summary className="cursor-pointer px-4 py-2.5 font-medium text-[#334155]">Thông tin đăng ký</summary>
          <div className="space-y-3 border-t border-slate-200 p-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Trường">{reg.summary.schoolName}</Field><Field label="Đại diện đăng ký">{reg.summary.representativeName}</Field>
              <Field label="Người liên hệ">{reg.contactName}</Field><Field label="Email liên hệ"><span className="break-all">{reg.contactEmail}</span></Field>
              <Field label="Số dòng lời mời">{reg.summary.rowCount}</Field><Field label="Gửi lúc">{reviewTime(reg.summary.submittedAt)}</Field>
              {reg.reviewedAt && <Field label="Xét duyệt lúc">{reviewTime(reg.reviewedAt)}</Field>}
            </dl>
            <p className="text-slate-600">Điểm xem chung ghi người phụ trách màn hình; số dòng không phải số học sinh tham dự.</p>
            <p className="text-slate-600">Yêu cầu đổi email cần quy trình gửi và xét duyệt riêng; chức năng này chưa được triển khai.</p>
          </div>
        </details>
        {showInvitations && <div className="flex gap-1 border-b border-[#eef1f4] pb-2" aria-label="Phần của đăng ký">
          <button type="button" aria-pressed={tab === 'roster'} className={tabClass(tab === 'roster')} onClick={() => setChosenTab('roster')}>Danh sách dòng ({reg.roster.length})</button>
          <button type="button" aria-pressed={tab === 'invitations'} className={tabClass(tab === 'invitations')} onClick={() => setChosenTab('invitations')}>Lời mời và email</button>
        </div>}
        {tab === 'invitations'
          ? <InvitationPanel registrationId={id} rowVersion={reg.rowVersion} tourRowVersion={reg.tourRowVersion} />
          : <>
            {selectable.length > 0 && <div className="sticky -top-4 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2">
              <label className="flex items-center gap-2 text-[13px] font-medium text-[#334155]">
                <input type="checkbox" className="size-4 accent-[#2563eb]" checked={allChosen} disabled={!canWrite} onChange={() => setSelected(new Set(allChosen ? [] : selectable.map(row => row.id)))} />
                Chọn tất cả {selectable.length} dòng chờ
              </label>
              <div className="flex flex-wrap gap-2">
                <button className={buttonClass('primary', 'sm')} disabled={!canWrite || chosen.length === 0} onClick={() => setConfirm({ action: 'accept', rows: chosen })}>Chấp nhận đã chọn ({chosen.length})</button>
                <button className={buttonClass('danger', 'sm')} disabled={!canWrite || chosen.length === 0} onClick={() => setConfirm({ action: 'reject', rows: chosen })}>Từ chối đã chọn ({chosen.length})</button>
              </div>
            </div>}
            <RosterPreview rows={[...reg.roster].sort((a, b) => Number(b.participationState === 'PENDING') - Number(a.participationState === 'PENDING'))} label="Roster đăng ký" maxHeight="max-h-none"
              rowSelect={selectable.length > 0 ? row => selectable.includes(row) && <label className="flex"><span className="sr-only">Chọn {row.displayName}</span><input type="checkbox" className="size-4 accent-[#2563eb]" checked={selected.has(row.id)} disabled={!canWrite} onChange={() => toggle(row.id)} /></label> : undefined}
              rowAction={row => <div className="space-y-2">
                <p className="font-medium whitespace-nowrap text-slate-700">{rowState[row.participationState]}</p>
                {row.reviewReason && <p className="text-xs text-slate-500">{row.reviewReason}</p>}
                {row.participationState === 'PENDING' && (row.canApprove && row.canReject
                  ? <div className="flex gap-2"><button className={buttonClass('primary', 'sm')} disabled={!canWrite} onClick={() => setConfirm({ action: 'accept', rows: [row] })}>Chấp nhận <span className="sr-only">{row.displayName}</span></button>
                    <button className={buttonClass('danger', 'sm')} disabled={!canWrite} onClick={() => setConfirm({ action: 'reject', rows: [row] })}>Từ chối <span className="sr-only">{row.displayName}</span></button></div>
                  : <p className="text-xs text-slate-500">{needsReload ? 'Cần tải lại dữ liệu.' : reg.summary.tourState !== 'SCHEDULED' ? 'Tour không mở xét duyệt.' : 'Không có quyền xét duyệt dòng này.'}</p>)}
              </div>} />
            <button className={buttonClass('secondary', 'sm')} disabled={!canWrite} onClick={() => void reload()}>Tải lại đăng ký</button>
          </>}
      </div>}
    </Drawer>
    {reg && confirm && <ConfirmationDialog key={`${id}-${confirm.action}-${confirm.rows.map(row => row.id).join()}`} open
      title={`${confirm.action === 'reject' ? 'Từ chối' : 'Chấp nhận'} ${bulk ? `${confirm.rows.length} dòng đã chọn` : `dòng ${confirm.rows[0].displayName}`}?`}
      description={bulk
        ? <>{names}. {confirm.action === 'reject' ? 'Các dòng này dùng chung lý do bên dưới và đại diện sẽ thấy lý do để sửa thông tin.' : 'Mỗi dòng được lưu thành một quyết định riêng. Việc phát hành lời mời và gửi email được xử lý riêng.'}</>
        : confirm.action === 'reject' ? 'Chỉ dòng này bị từ chối. Đại diện sẽ thấy lý do để sửa thông tin.' : 'Chỉ dòng này được chấp nhận. Việc phát hành lời mời và gửi email được xử lý riêng.'}
      confirmLabel={`${confirm.action === 'reject' ? 'Từ chối' : 'Chấp nhận'} ${bulk ? `${confirm.rows.length} dòng` : 'dòng'}`} busyLabel={bulk && progress ? `Đang lưu ${progress.done}/${progress.total}…` : 'Đang lưu…'} tone={confirm.action === 'reject' ? 'danger' : 'default'}
      withReason={confirm.action === 'reject'} requireReason reasonLabel="Lý do từ chối" reasonPlaceholder="Nêu thông tin cần đại diện sửa." busy={mutation.isPending || progress !== null}
      error={error?.message} onConfirm={reason => void decide(reason)} onCancel={() => { if (!mutation.isPending && !progress) setConfirm(null) }} />}
  </>
}

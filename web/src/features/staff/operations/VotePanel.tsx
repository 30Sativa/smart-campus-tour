import { useState } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog'
import { notify } from '../../../components/ui/toast-store'
import { buttonClass, tdClass, thClass } from '../../../components/ui/ui-classes'
import type { TourDetails } from '../../administration/tours/types'
import { clockText, decisionText, secondsLeft, votesText } from '../../tour-vote/vote'
import { useStopLock } from './hooks'
import { operationRefusal } from './operation-errors'
import { voteState, type VoteStop } from './situation'
import { ToneBadge } from './OperationParts'

/**
 * ADR-0065: the Viewers' vote at the current POI, for the Operator. The server counts and decides; this shows its
 * counts, the leader, the dwell left and the POIs ahead, which the Operator may lock or unlock with a reason every
 * Viewer sees. The Operator never picks the destination. Nothing is shown for a route that does not vote.
 */
export function VotePanel({ detail, isOperator, now }: { detail: TourDetails; isOperator: boolean; now: number }) {
  const vote = voteState(detail)
  const lock = useStopLock()
  // Holds the stop itself, so the dialog survives the row moving between lists while saving.
  const [dialog, setDialog] = useState<{ stop: VoteStop; locked: boolean } | null>(null)
  if (!vote.voting) return null
  const { ballot } = vote
  const running = detail.tour.state === 'RUNNING'
  const canLock = running && isOperator
  const left = ballot?.open ? secondsLeft(ballot.closesAt ?? detail.execution?.dwellDeadlineAt, now) : null
  const decision = ballot?.decision ? decisionText(ballot.decision) : null
  const refusal = lock.isError ? operationRefusal(lock.error, { operator: true }).message : null
  const leading = vote.leadingStopId

  return <section aria-label="Bầu chọn điểm tiếp theo" className="space-y-3 p-4">
    {!ballot ? <p className="text-[13px] text-[#475569]">Chưa có bầu chọn. Bầu chọn mở khi robot tới một POI và còn ít nhất hai điểm để chọn.</p> : <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-[#0f172a]">{ballot.open ? 'Học sinh đang bầu' : 'Bầu chọn đã đóng'}</p>
        {ballot.open && left !== null && <span role="timer" aria-live="off" className="rounded-full bg-[#eff6ff] px-2.5 py-0.5 text-xs font-semibold text-[#1d4ed8] tabular-nums">Còn {clockText(left)} thời gian dừng</span>}
      </div>
      {ballot.candidates.length > 0 && <table className="w-full text-left" aria-label="Số phiếu">
        <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>Điểm</th><th className={`${thClass} text-right`}>Số phiếu</th></tr></thead>
        <tbody className="divide-y divide-[#f1f5f9]">{ballot.candidates.map(candidate => <tr key={candidate.stopId}>
          <td className={tdClass}><span className="font-semibold text-[#0f172a]">{candidate.name}</span>{candidate.stopId === leading && <> <ToneBadge tone="info">Đang dẫn đầu</ToneBadge></>}</td>
          <td className={`${tdClass} text-right tabular-nums`}>{votesText(candidate.votes)}</td>
        </tr>)}</tbody>
      </table>}
      {decision && <p role="status" className="text-[13px] text-[#0f172a]"><span className="font-semibold">{decision.title}</span>{decision.note && <span className="block text-[#475569]">{decision.note}</span>}</p>}
    </>}

    {vote.remaining.length > 0 && <div>
      <p className="mb-1 text-[13px] font-semibold text-[#0f172a]">Các điểm còn lại</p>
      <ul className="divide-y divide-[#f1f5f9]">{vote.remaining.map(stop => <li key={stop.stopId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
        <span className="min-w-0"><span className="font-semibold text-[#0f172a]">{stop.name}</span>
          {stop.locked && <> <ToneBadge tone="warn">Tạm khóa</ToneBadge></>}{stop.next && <> <ToneBadge tone="info">Điểm tiếp theo</ToneBadge></>}
          {stop.locked && stop.reason && <span className="block text-xs text-muted">Lý do: {stop.reason}</span>}</span>
        {canLock && <button type="button" className={buttonClass('secondary', 'sm')} disabled={lock.isPending}
          onClick={() => { lock.reset(); setDialog({ stop, locked: !stop.locked }) }}>
          {stop.locked ? <><LockOpen size={14} aria-hidden="true" />Mở khóa {stop.name}</> : <><Lock size={14} aria-hidden="true" />Khóa {stop.name}</>}
        </button>}
      </li>)}</ul>
    </div>}
    {vote.allRemainingLocked && <p className="text-[13px] font-semibold text-[#7d5310]">Mọi điểm còn lại đang tạm khóa. Mở khóa một điểm, hoặc bấm Bỏ qua các điểm còn lại để về điểm kết thúc.</p>}

    <ConfirmationDialog open={dialog !== null} tone={dialog?.locked ? 'danger' : 'default'}
      title={dialog ? `${dialog.locked ? 'Khóa' : 'Mở khóa'} ${dialog.stop.name}?` : ''}
      confirmLabel={dialog?.locked ? 'Khóa điểm' : 'Mở khóa'} busyLabel="Đang gửi…" busy={lock.isPending} error={refusal}
      description={dialog?.locked
        ? 'Điểm này bị bỏ khỏi bầu chọn và các phiếu đã bầu cho nó bị xóa. Mọi học sinh thấy lý do bạn nhập.'
        : 'Điểm này được học sinh bầu chọn lại. Mọi học sinh thấy lý do bạn nhập.'}
      withReason requireReason reasonLabel={dialog?.locked ? 'Lý do khóa' : 'Lý do mở khóa'}
      reasonPlaceholder={dialog?.locked ? 'Ví dụ: phòng 601 đang có lớp học, không vào được.' : 'Ví dụ: phòng 601 đã trống.'}
      onCancel={() => { if (!lock.isPending) setDialog(null) }}
      onConfirm={reason => {
        if (!dialog) return
        const { stop, locked } = dialog
        lock.mutateAsync({ id: detail.tour.id, stopId: stop.stopId, reason, locked })
          .then(() => { setDialog(null); notify({ title: locked ? `Đã khóa ${stop.name}` : `Đã mở khóa ${stop.name}` }) }, () => undefined)
      }} />
  </section>
}

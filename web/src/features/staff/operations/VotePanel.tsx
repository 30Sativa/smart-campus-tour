import { useState } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog'
import { notify } from '../../../components/ui/toast-store'
import { buttonClass } from '../../../components/ui/ui-classes'
import type { TourDetails } from '../../administration/tours/types'
import { clockText, decisionText, secondsLeft, votesText } from '../../tour-vote/vote'
import { useStopLock } from './hooks'
import { readTurnout, useBallotLive } from './ballot-live'
import { useFleetConnection } from './fleet-telemetry'
import { ALL_REMAINING_LOCKED_TEXT, operationRefusal } from './operation-errors'
import { currentLegStop, sameStop, voteState, type VoteStop } from './situation'
import { ToneBadge } from './OperationParts'

/**
 * ADR-0065: the Viewers' vote at the current POI, for the Operator. The server counts and decides; this shows its
 * counts, the leader, the dwell left and the POIs ahead, which the Operator may lock or unlock with a reason every
 * Viewer sees. The Operator never picks the destination. Nothing is shown for a route that does not vote.
 * Each vote is pushed by the hub (`BallotUpdated`) the moment it commits; the 3 s poll is the fallback.
 */
export function VotePanel({ detail, isOperator, now }: { detail: TourDetails; isOperator: boolean; now: number }) {
  const vote = voteState(detail)
  const lock = useStopLock()
  const live = useFleetConnection(store => store.state) === 'connected'
  const lastVoteAt = useBallotLive(store => store.lastVoteAt[detail.tour.id])
  // Holds the stop itself, so the dialog survives the row moving between lists while saving.
  const [dialog, setDialog] = useState<{ stop: VoteStop; locked: boolean; legTarget: boolean } | null>(null)
  if (!vote.voting) return null
  const { ballot } = vote
  const running = detail.tour.state === 'RUNNING'
  const canLock = running && isOperator
  // The POI the robot is driving to can be locked only once that leg has really stopped (Resume/Retry offered).
  const leg = currentLegStop(detail)
  const legTarget = (stop: VoteStop) => Boolean(leg && sameStop(leg.stopId, stop.stopId))
  const underWay = (stop: VoteStop) => !stop.locked && !leg?.stopped && legTarget(stop)
  const left = ballot?.open ? secondsLeft(ballot.closesAt ?? detail.execution?.dwellDeadlineAt, now) : null
  const decision = ballot?.decision ? decisionText(ballot.decision) : null
  const refusal = lock.isError ? operationRefusal(lock.error, { operator: true }).message : null
  const leading = vote.leadingStopId
  const total = ballot ? ballot.candidates.reduce((sum, candidate) => sum + candidate.votes, 0) : 0
  const turnout = readTurnout(detail.viewers)
  const share = (votes: number) => total > 0 ? Math.round(votes / total * 100) : 0

  // A POI on the ballot is locked from its own row; the list below keeps only the POIs off the ballot (locked ones).
  const onBallot = (stopId: string) => Boolean(ballot?.candidates.some(candidate => sameStop(candidate.stopId, stopId)))
  const rowStop = (stopId: string) => vote.remaining.find(stop => sameStop(stop.stopId, stopId))
  const others = vote.remaining.filter(stop => !onBallot(stop.stopId))
  const lockControl = (stop: VoteStop, compact: boolean) => !canLock ? null
    : underWay(stop) ? <span className="text-xs text-muted">Robot đang tới điểm này, chỉ khóa được khi robot đã dừng</span>
      : <button type="button" className={buttonClass('secondary', 'sm')} disabled={lock.isPending}
        aria-label={`${stop.locked ? 'Mở khóa' : 'Khóa'} ${stop.name}`} title={`${stop.locked ? 'Mở khóa' : 'Khóa'} ${stop.name}`}
        onClick={() => { lock.reset(); setDialog({ stop, locked: !stop.locked, legTarget: legTarget(stop) }) }}>
        {stop.locked ? <LockOpen size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
        {compact ? (stop.locked ? 'Mở khóa' : 'Khóa') : `${stop.locked ? 'Mở khóa' : 'Khóa'} ${stop.name}`}
      </button>

  return <section aria-label="Bầu chọn điểm tiếp theo" className="space-y-3 p-4">
    {!ballot ? <p className="text-[13px] text-[#475569]">Chưa có bầu chọn. Bầu chọn mở khi robot tới một POI và còn ít nhất hai điểm để chọn.</p> : <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-[#0f172a]">{ballot.open ? 'Học sinh đang bầu' : 'Bầu chọn đã đóng'}
          {ballot.open && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${live ? 'bg-[#ecfdf3] text-[#166534]' : 'bg-[#f1f5f9] text-[#475569]'}`}
            title={live ? 'Mỗi phiếu hiện ngay khi học sinh bầu' : 'Mất kết nối trực tiếp, đang cập nhật mỗi 3 giây'}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-[#16a34a] motion-safe:animate-pulse' : 'bg-[#94a3b8]'}`} />{live ? 'Trực tiếp' : 'Cập nhật mỗi 3 giây'}</span>}</p>
        {ballot.open && left !== null && <span role="timer" aria-live="off" className="rounded-full bg-[#eff6ff] px-2.5 py-0.5 text-xs font-semibold text-[#1d4ed8] tabular-nums">Còn {clockText(left)} thời gian dừng</span>}
      </div>
      <p className="text-xs text-[#475569]" aria-label="Lượt bầu">
        <span className="text-[15px] font-bold text-[#0f172a] tabular-nums">{votesText(total)}</span>
        {turnout && <> · {turnout.joined}/{turnout.accepted} người xem đang vào</>}
        {lastVoteAt && <> · phiếu mới lúc {new Date(lastVoteAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</>}
      </p>
      {ballot.candidates.length > 0 && <table className="w-full text-left" aria-label="Số phiếu">
        <thead className="sr-only"><tr><th>Điểm</th><th>Số phiếu</th>{canLock && <th>Khóa điểm</th>}</tr></thead>
        <tbody className="divide-y divide-[#f1f5f9]">{ballot.candidates.map(candidate => {
          const stop = rowStop(candidate.stopId)
          const leads = candidate.stopId === leading
          return <tr key={candidate.stopId} className={leads ? 'bg-[#f5f9ff]' : undefined}>
            <td className="py-2.5 pr-3 pl-2 align-top">
              <span className="block text-[14px] leading-5 font-semibold text-[#0f172a]">{candidate.name}</span>
              {(leads || stop?.next) && <span className="mt-1 flex flex-wrap gap-1">{leads && <ToneBadge tone="info">Đang dẫn đầu</ToneBadge>}{stop?.next && <ToneBadge tone="info">Điểm tiếp theo</ToneBadge>}</span>}
              <span aria-hidden="true" className="mt-2 block h-2 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
                <span className={`block h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none ${leads ? 'bg-[#2563eb]' : 'bg-[#94a3b8]'}`}
                  style={{ width: `${share(candidate.votes)}%` }} /></span></td>
            <td className="py-2.5 pr-2 text-right align-top whitespace-nowrap tabular-nums"><span className="text-[15px] font-bold text-[#0f172a]">{votesText(candidate.votes)}</span>
              <span className="block text-xs text-muted">{share(candidate.votes)}%</span></td>
            {canLock && <td className="py-2.5 pr-2 text-right align-top">{stop && lockControl(stop, true)}</td>}
          </tr>
        })}</tbody>
      </table>}
      {decision && <p role="status" className="text-[13px] text-[#0f172a]"><span className="font-semibold">{decision.title}</span>{decision.note && <span className="block text-[#475569]">{decision.note}</span>}</p>}
    </>}

    {others.length > 0 && <div>
      <p className="mb-1 text-[13px] font-semibold text-[#0f172a]">{ballot ? 'Không có trong bầu chọn' : 'Các điểm còn lại'}</p>
      <ul className="divide-y divide-[#f1f5f9]">{others.map(stop => <li key={stop.stopId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
        <span className="min-w-0"><span className="font-semibold text-[#0f172a]">{stop.name}</span>
          {stop.locked && <> <ToneBadge tone="warn">Tạm khóa</ToneBadge></>}{stop.next && <> <ToneBadge tone="info">Điểm tiếp theo</ToneBadge></>}
          {stop.locked && stop.reason && <span className="block text-xs text-muted">Lý do: {stop.reason}</span>}</span>
        {lockControl(stop, false)}
      </li>)}</ul>
    </div>}
    {vote.allRemainingLocked && <p className="text-[13px] font-semibold text-[#7d5310]">{ALL_REMAINING_LOCKED_TEXT}</p>}

    <ConfirmationDialog open={dialog !== null} tone={dialog?.locked ? 'danger' : 'default'}
      title={dialog ? `${dialog.locked ? 'Khóa' : 'Mở khóa'} ${dialog.stop.name}?` : ''}
      confirmLabel={dialog?.locked ? 'Khóa điểm' : 'Mở khóa'} busyLabel="Đang gửi…" busy={lock.isPending} error={refusal}
      description={dialog?.locked
        ? `Điểm này bị bỏ khỏi bầu chọn và các phiếu đã bầu cho nó bị xóa. Mọi học sinh thấy lý do bạn nhập.${dialog.legTarget ? ' Robot sẽ đi tới điểm được bầu nhiều kế tiếp khi bạn cho đi tiếp.' : ''}`
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

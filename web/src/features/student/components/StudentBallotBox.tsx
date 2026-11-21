import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Lock, Timer, Vote } from 'lucide-react'
import { clockText, decisionText, secondsLeft, voteRefusal, votesText, type BallotLockedStop, type TourBallot } from '../../tour-vote/vote'
import { studentTourViewKey, voteForNextStop, type StudentTourView } from '../invitation/student-tour-view'

/**
 * ADR-0065: the ballot at the current POI. Each invitation row has one vote and may change it until the ballot closes;
 * the server decides and counts, this only shows its answer. Locked POIs are listed with the Operator's reason.
 */
export function StudentBallotBox({ tourId, ballot, locked, shared }: {
  tourId: string
  ballot: TourBallot | null
  /** Locked POIs not yet visited; the ballot's own list while one is open, else the route's stops. */
  locked: BallotLockedStop[]
  shared: boolean
}) {
  const client = useQueryClient()
  const [now, setNow] = useState(() => Date.now())
  const ticking = Boolean(ballot?.open && !ballot.decision)
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [ticking])
  const vote = useMutation({
    mutationFn: ({ stopVisitId, stopId }: { stopVisitId: string; stopId: string }) => voteForNextStop(tourId, stopVisitId, stopId),
    onSuccess: next => {
      if (next) client.setQueryData<StudentTourView | null>(studentTourViewKey(tourId), old => old ? { ...old, ballot: next } : old)
    },
    // A refused vote means the ballot moved on (closed, or the POI was locked): read it again.
    onError: () => void client.invalidateQueries({ queryKey: studentTourViewKey(tourId) }),
  })
  if (!ballot && !locked.length) return null

  const left = ballot ? secondsLeft(ballot.closesAt, now) : null
  const open = Boolean(ballot?.open && !ballot.decision && (left === null || left > 0))
  const mine = vote.isPending ? vote.variables.stopId : ballot?.myVote ?? null
  const mineName = ballot?.candidates.find(candidate => candidate.stopId === mine)?.name
  const decision = ballot?.decision ? decisionText(ballot.decision) : null

  return <section className="st-vote" aria-label="Bầu chọn điểm tiếp theo">
    {ballot && (decision
      ? <div className="st-vote__decision" role="status"><b>{decision.title}</b>{decision.note && <span>{decision.note}</span>}</div>
      : <>
        <header className="st-vote__head">
          <h3><Vote size={18} aria-hidden="true" />Chọn điểm tiếp theo</h3>
          <span className="st-vote__clock" role="timer" aria-live="off"><Timer size={14} aria-hidden="true" />
            {open ? left !== null ? `Còn ${clockText(left)} để bầu` : 'Đang mở bầu chọn' : 'Đã hết giờ bầu, đang chốt kết quả'}</span>
        </header>
        <p className="st-vote__hint">{shared ? 'Màn hình xem chung có một phiếu cho cả phòng.' : 'Mỗi lời mời có một phiếu.'} Bạn đổi được phiếu tới khi hết giờ.</p>
        <ul className="st-vote__list">
          {ballot.candidates.map(candidate => {
            const chosen = mine === candidate.stopId
            return <li key={candidate.stopId}>
              <button type="button" className={`st-vote__option${chosen ? ' is-mine' : ''}`} aria-pressed={chosen} disabled={!open || vote.isPending}
                onClick={() => { if (!chosen) vote.mutate({ stopVisitId: ballot.stopVisitId, stopId: candidate.stopId }) }}>
                <span className="st-vote__name">{chosen && <Check size={15} aria-hidden="true" />}{candidate.name}</span>
                <span className="st-vote__count">{votesText(candidate.votes)}</span>
                {chosen && <small>Phiếu của bạn</small>}
              </button>
            </li>
          })}
        </ul>
        {mineName && !vote.isError && <p className="st-vote__mine" role="status">{vote.isPending ? `Đang gửi phiếu cho ${mineName}…` : `Bạn đã bầu ${mineName}.`}</p>}
        {vote.isError && <p className="st-session-error" role="alert">{voteRefusal(vote.error)}</p>}
      </>)}
    {locked.length > 0 && <ul className="st-vote__locked" aria-label="Điểm tạm khóa">
      {locked.map(stop => <li key={stop.stopId}><Lock size={14} aria-hidden="true" /><span>Tạm khóa {stop.name}{stop.reason ? `. Lý do: ${stop.reason}` : ''}</span></li>)}
    </ul>}
  </section>
}

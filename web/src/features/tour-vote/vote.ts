/**
 * ADR-0065 (Workflow C): the Viewers' vote for the next POI, as the Student view and the Staff Tour detail return it.
 * One wire shape for both screens, read tolerantly: the backend is new and an older one omits every field, which
 * leaves a Tour looking exactly as before.
 */
import { ApiError } from '../../api/client'

/** Where a route POI stands in a voting Tour; never inferred from `StopOrder` (ADR-0065 Runtime). */
export type StopProgress = 'VISITED' | 'SKIPPED' | 'CURRENT' | 'NEXT' | 'REMAINING'
export type VoteDecisionReason = 'VOTE' | 'TIE_DEFAULT' | 'NO_VOTES' | 'LOCKED_FALLBACK' | 'SINGLE_CANDIDATE'

export type BallotCandidate = { stopId: string; poiId: string; name: string; votes: number }
export type BallotLockedStop = { stopId: string; name: string; reason: string }
export type BallotDecision = { stopId: string; name: string; reason: string; votes: number }
export type TourBallot = {
  stopVisitId: string
  open: boolean
  /** The dwell deadline; votes are accepted until then by server time. */
  closesAt: string | null
  candidates: BallotCandidate[]
  /** The stop this roster row voted for, kept across reloads (the vote belongs to the row, not the browser). */
  myVote: string | null
  locked: BallotLockedStop[]
  decision: BallotDecision | null
}
/** What the Operator's Next leads to: a POI, or the end. */
export type NextTarget = { kind: 'POI' | 'END'; stopId: string | null; name: string }

const PROGRESS = new Set<string>(['VISITED', 'SKIPPED', 'CURRENT', 'NEXT', 'REMAINING'])
const text = (value: unknown) => typeof value === 'string' ? value : ''
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' ? value as Record<string, unknown> : null

export function readProgress(value: unknown): StopProgress | null {
  return typeof value === 'string' && PROGRESS.has(value) ? value as StopProgress : null
}

/** The ballot as the screens use it, or null for none (a route that does not vote, or no current POI). */
export function readBallot(raw: unknown): TourBallot | null {
  const value = record(raw)
  if (!value || !text(value.stopVisitId)) return null
  const list = (items: unknown) => Array.isArray(items) ? items.map(record).filter((item): item is Record<string, unknown> => item !== null) : []
  // `myVote` is the stop id; an object `{ stopId }` is read the same way.
  const mine = typeof value.myVote === 'string' ? value.myVote : text(record(value.myVote)?.stopId)
  const decision = record(value.decision)
  return {
    stopVisitId: text(value.stopVisitId),
    open: value.open === true,
    closesAt: text(value.closesAt) || null,
    candidates: list(value.candidates).filter(item => text(item.stopId))
      .map(item => ({ stopId: text(item.stopId), poiId: text(item.poiId), name: text(item.name) || 'POI', votes: count(item.votes) })),
    myVote: mine || null,
    locked: list(value.locked).filter(item => text(item.stopId))
      .map(item => ({ stopId: text(item.stopId), name: text(item.name) || 'POI', reason: text(item.reason) })),
    decision: decision && text(decision.stopId)
      ? { stopId: text(decision.stopId), name: text(decision.name) || 'POI', reason: text(decision.reason), votes: count(decision.votes) }
      : null,
  }
}

export function readNextTarget(raw: unknown): NextTarget | null {
  const value = record(raw)
  if (!value || (value.kind !== 'POI' && value.kind !== 'END')) return null
  return { kind: value.kind, stopId: text(value.stopId) || null, name: text(value.name) }
}

export const votesText = (votes: number) => `${votes} phiếu`

/**
 * The server's decision in plain words: the next POI, then why when the vote did not decide it.
 * "Điểm tiếp theo: C (2 phiếu)", "Hòa phiếu, đi theo thứ tự đã đặt", "Không ai bầu, đi theo thứ tự đã đặt".
 */
export function decisionText(decision: BallotDecision): { title: string; note: string | null } {
  switch (decision.reason) {
    case 'TIE_DEFAULT': return { title: `Điểm tiếp theo: ${decision.name}`, note: 'Hòa phiếu, đi theo thứ tự đã đặt' }
    case 'NO_VOTES': return { title: `Điểm tiếp theo: ${decision.name}`, note: 'Không ai bầu, đi theo thứ tự đã đặt' }
    case 'LOCKED_FALLBACK': return { title: `Điểm tiếp theo: ${decision.name}`, note: 'Điểm được bầu vừa tạm khóa, chọn lại theo số phiếu' }
    case 'SINGLE_CANDIDATE': return { title: `Điểm tiếp theo: ${decision.name}`, note: 'Chỉ còn một điểm chưa tham quan' }
    default: return { title: `Điểm tiếp theo: ${decision.name} (${votesText(decision.votes)})`, note: null }
  }
}

/** Whole seconds left until `closesAt` by this browser's clock; 0 once it passed, null without a deadline. */
export function secondsLeft(closesAt: string | null | undefined, now: number): number | null {
  if (!closesAt) return null
  const at = Date.parse(closesAt)
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : null
}

/** "1:05". */
export const clockText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/** The candidate with the most votes, by the server's tie rule only when the server sent its own leader. */
export function leadingCandidate(ballot: TourBallot, leadingStopId?: string | null): BallotCandidate | null {
  return ballot.candidates.find(candidate => candidate.stopId === leadingStopId) ?? null
}

/** A refused vote in the Viewer's words (409 VOTE_CLOSED / VOTE_CANDIDATE_INVALID). */
export function voteRefusal(error: unknown): string {
  if (error instanceof ApiError) {
    let code: unknown
    try { code = (JSON.parse(error.body) as { errors?: { code?: unknown } }).errors?.code } catch { code = undefined }
    if (code === 'VOTE_CLOSED') return 'Đã hết giờ bầu chọn ở điểm này, phiếu vừa gửi không được tính.'
    if (code === 'VOTE_CANDIDATE_INVALID') return 'Điểm này không còn trong danh sách bầu, có thể vừa tạm khóa. Hãy chọn điểm khác.'
    if (error.status === 401) return 'Phiên xem đã kết thúc nên chưa bầu được.'
  }
  return 'Chưa gửi được phiếu. Kiểm tra kết nối rồi thử lại.'
}

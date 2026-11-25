import { useEffect, useRef, useState } from 'react'
import { hashKey, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Captions, KeyRound, LifeBuoy, Mail, MessageSquare } from 'lucide-react'
import { apiClient, ApiError } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'
import { StudentHeader } from '../components/StudentHeader'
import { StudentWaitingRoom } from '../components/StudentWaitingRoom'
import { StudentLiveView } from '../components/StudentLiveView'
import { StudentEndScreen } from '../components/StudentEndScreen'
import { LiveStudentAiAssistant } from '../components/LiveStudentAiAssistant'
import { WaitingRoomAssistant } from '../components/WaitingRoomAssistant'
import { StudentTalkPanel } from '../components/StudentTalkPanel'
import { useStudentTalk } from '../talk/student-talk'
import { useStudentStore } from '../student-store'
import { useLiveStudentAiChat } from '../ai/use-live-student-ai-chat'
import { StudentBallotBox } from '../components/StudentBallotBox'
import { readBallot } from '../../tour-vote/vote'
import { useStudentFallbackAccess, useStudentStreamAccess } from '../../quest-stream/stream-access'
import { formatDateTime } from '../../../components/ui/date-time'
import { ENTER_TOUR_LABEL } from './invitation-labels'
import { buildLiveSnapshot, getStudentTourView, studentTourViewKey, type StudentTourInfo } from './student-tour-view'
import '../student.css'
import '../student-expedition.css'
import './invitation.css'

const path = (id: string) => `/api/student/tours/${encodeURIComponent(id)}`
async function access(tourId: string, action: string, code?: string, signal?: AbortSignal) {
  return (await apiClient<ApiResponse<StudentTourInfo | null>>(`${path(tourId)}/${action}`, {
    method: 'POST', credentials: 'include', auth: false, signal, ...(code ? { json: { accessCode: code } } : {}),
  })).data
}
const RECONNECT_WINDOW_EXPIRED = 'RECONNECT_WINDOW_EXPIRED'
// Also said when the session simply expired (a tab asleep past its lease), so it names revocation only as a possibility.
const SESSION_ENDED = 'Phiên xem đã kết thúc. Mã có thể đã bị thu hồi hoặc thay bằng mã mới; kiểm tra email mới nhất rồi nhập lại mã, hoặc liên hệ đại diện đoàn.'
const TOUR_ENDED = 'TOUR_ENDED'
const IN_USE_FALLBACK = 'Lời mời đang được dùng trên trình duyệt khác. Liên hệ đại diện để thu hồi và cấp mã mới.'
/** A 409's code, message and `errors.fields` (retryAfterSeconds, tourState; docs/architecture.md §3.2.3). */
function conflict(error: ApiError): { code?: string; message?: string; retryAfterSeconds?: number; tourState?: string } {
  try {
    const body = JSON.parse(error.body) as { message?: unknown; errors?: { code?: unknown; fields?: { retryAfterSeconds?: unknown; tourState?: unknown } } }
    const fields = body.errors?.fields
    const seconds = Number(Array.isArray(fields?.retryAfterSeconds) ? fields.retryAfterSeconds[0] : undefined)
    const tourState = Array.isArray(fields?.tourState) ? fields.tourState[0] : undefined
    return {
      code: typeof body.errors?.code === 'string' ? body.errors.code : undefined,
      message: typeof body.message === 'string' && body.message.trim() ? body.message : undefined,
      retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : undefined,
      tourState: typeof tourState === 'string' ? tourState : undefined,
    }
  } catch { return {} }
}
const isReconnectWindowExpired = (error: unknown) =>
  error instanceof ApiError && error.status === 409 && conflict(error).code === RECONNECT_WINDOW_EXPIRED
/** 409 TOUR_ENDED: the invitation is still proven but its Tour is COMPLETED or was CANCELLED before it ran. */
function tourEnded(error: unknown): { tourState: 'COMPLETED' | 'CANCELLED' } | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const { code, tourState } = conflict(error)
  return code === TOUR_ENDED ? { tourState: tourState === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED' } : null
}
function conflictMessage(error: ApiError) {
  const { code, message, retryAfterSeconds, tourState } = conflict(error)
  if (code === TOUR_ENDED) return message ?? (tourState === 'CANCELLED' ? 'Buổi tham quan đã bị hủy.' : 'Buổi tham quan đã kết thúc.')
  if (code === RECONNECT_WINDOW_EXPIRED) {
    const text = message ?? 'Trình duyệt này đã mất kết nối quá lâu nên phiên cũ đang bị giữ. Nhờ đại diện hoặc Staff cấp mã mới để vào ngay.'
    // The backend sentence may already name the wait; never say it twice.
    if (!retryAfterSeconds || /thử lại sau/i.test(text)) return text
    return `${text} Thử lại sau khoảng ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} phút.`
  }
  return code === 'INVITATION_IN_USE' && message ? message : IN_USE_FALLBACK
}
function accessError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 400) return 'Mã truy cập không hợp lệ. Kiểm tra mã trong email rồi thử lại.'
    if (error.status === 401) return 'Mã hoặc phiên đã hết hạn, bị thu hồi hoặc không thuộc Tour này.'
    if (error.status === 403) return 'Nguồn truy cập không được phép. Liên hệ quản trị hệ thống để kiểm tra cấu hình truy cập.'
    if (error.status === 409) return conflictMessage(error)
    if (error.status === 429) return 'Bạn đã thử quá nhiều lần. Đợi một phút rồi thử lại.'
  }
  return 'Không kết nối được hệ thống. Vui lòng thử lại.'
}
export const SESSION_CHECK_RUNNING_MS = 5000
/** The page never waits silently longer than this for the first session check. */
export const SESSION_CHECK_WATCHDOG_MS = 8000
/** Cancelled, offline or server-side failures say nothing about the invitation itself. */
const uncheckedError = (error: unknown) => !(error instanceof ApiError) || error.status >= 500

/**
 * Invited Student page for a SQL Tour (docs/architecture.md §3.2.3, §7.1): access-code entry, then the same
 * waiting room / live / end screens as the labelled demo, filled with real data only. No student identity is shown:
 * the cookie session carries none. The 2D map stays hidden until a robot pose feed exists.
 */
export function StudentInvitationPage({ tourId }: { tourId: string }) {
  const client = useQueryClient()
  const key = ['student-invitation', tourId]
  const [code, setCode] = useState('')
  const [left, setLeft] = useState(false)
  const [hadSession, setHadSession] = useState(false)
  // The last Tour this tab was admitted to; a later TOUR_ENDED reuses it for the end screen.
  const [lastInfo, setLastInfo] = useState<StudentTourInfo | null>(null)
  const join = useMutation({ mutationFn: () => access(tourId, 'join', code),
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: info => { setCode(''); setLeft(false); client.setQueryData(key, info) } })
  const exitSession = () => { setLeft(true); setHadSession(false); setLastInfo(null); client.setQueryData(key, null); join.reset() }
  const leave = useMutation({ mutationFn: () => access(tourId, 'leave'),
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: exitSession })
  const sessionEnabled = !left && !join.isPending && !leave.isPending
  // A heartbeat begun before join/leave must not overwrite the mutation's committed state.
  const session = useQuery({ queryKey: key, queryFn: ({ signal }) => access(tourId, 'session', undefined, signal),
    retry: false, enabled: sessionEnabled, refetchIntervalInBackground: true,
    // SRS v1.9: a revoked or reissued invitation must stop playback within 10 s,
    // so a running Tour re-checks the session every 5 s.
    // A held old session answers the same 409 until its lease ends: wait for the viewer, never poll it.
    // TOUR_ENDED is final: nothing to poll for either.
    refetchInterval: query => isReconnectWindowExpired(query.state.error) || tourEnded(query.state.error) ? false
      : query.state.data?.tourState === 'RUNNING' ? SESSION_CHECK_RUNNING_MS : 30000 })
  const sessionHash = hashKey(key)
  const [slow, setSlow] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const checkPending = session.isPending && !left
  // Never leave the Student on a silent loading card: after 8 s the code form is shown with a retry.
  useEffect(() => {
    if (!checkPending) return
    const timer = setTimeout(() => setSlow(true), SESSION_CHECK_WATCHDOG_MS)
    return () => clearTimeout(timer)
  }, [checkPending, attempt])
  const recheck = useRef<() => void>(() => {})
  useEffect(() => {
    const refetch = session.refetch
    recheck.current = sessionEnabled ? () => void refetch() : () => {}
    return () => { recheck.current = () => {} }
  }, [sessionEnabled, session.refetch])
  // Root cause of the stuck check: app/providers/query-provider.tsx clears the whole query cache when the account
  // session revision changes, and on a first visit AuthBootstrap's cookie refresh is refused (401 -> logout ->
  // new revision) while this check is in flight. The removed query is cancelled silently and its observer is never
  // told, so the page waited for the 30 s interval. Re-run the check on a fresh query as soon as it is removed.
  useEffect(() => client.getQueryCache().subscribe(event => {
    if (event.type === 'removed' && event.query.queryHash === sessionHash) setTimeout(() => recheck.current(), 0)
  }), [client, sessionHash])
  const retryCheck = () => {
    setSlow(false)
    setAttempt(value => value + 1)
    // A request that is still hanging is dropped first, so Thử lại always sends a new one.
    void client.cancelQueries({ queryKey: key }).then(() => recheck.current())
  }
  const accessDenied = session.isError && session.error instanceof ApiError && [401, 403, 409].includes(session.error.status)
  const sessionInfo = left || accessDenied ? null : session.data
  if (sessionInfo && sessionInfo !== lastInfo) setLastInfo(sessionInfo)
  const refused = !left && session.isError && session.error instanceof ApiError && session.error.status === 401
  // The session check goes from 200 RUNNING straight to 409 TOUR_ENDED when the Tour completes (or was cancelled
  // before it ran): show the end screen from what this tab already knew. With nothing known, the code form says why.
  const endedBy = left ? null : tourEnded(session.error)
  const finished = !!endedBy && !!lastInfo
  const info = finished ? { ...lastInfo!, tourState: endedBy!.tourState } : sessionInfo
  // A first visit has no cookie and gets a silent 401; a later 401 means the code was revoked, reissued or the session expired.
  if (sessionInfo && !hadSession) setHadSession(true)
  const ended = hadSession && refused
  // Route and progress; a failure only hides the stops, the session above stays the access authority.
  // One conversation for the page: what the group asked in the waiting room stays when the Tour starts.
  const aiChat = useLiveStudentAiChat(tourId)
  const view = useQuery({ queryKey: studentTourViewKey(tourId), queryFn: ({ signal }) => getStudentTourView(tourId, signal),
    retry: false, enabled: !!info && !finished && !leave.isPending,
    // While a vote is open the counts move every second or two; between POIs the usual pace is enough.
    refetchInterval: query => info?.tourState !== 'RUNNING' ? 30000 : readBallot(query.state.data?.ballot)?.open ? 2000 : 5000 })

  const unchecked = !left && !info && ((session.isPending && slow) || (session.isError && uncheckedError(session.error)))
  const shared = info?.rowType === 'SHARED_VIEWING'
  const sessionLabel = shared ? 'Màn hình xem chung' : 'Phiên lời mời cá nhân'
  const snapshot = info ? buildLiveSnapshot(info, view.data) : null
  // ADR-0065: the vote at the current POI and the POIs the Operator locked; none on a route that does not vote.
  const ballot = readBallot(view.data?.ballot)
  const locked = ballot?.locked.length ? ballot.locked
    : (snapshot?.pois ?? []).filter(poi => poi.lockReason && poi.progress !== 'VISITED' && poi.progress !== 'SKIPPED')
      .map(poi => ({ stopId: poi.stopId ?? poi.id, name: poi.title, reason: poi.lockReason ?? '' }))
  // ADR-0055: the relay URL and a short token, renewed while the Tour runs; refused once access ends.
  const quest = useStudentStreamAccess(tourId, snapshot?.tourState === 'Running' && !leave.isPending)
  // ADR-0070: talk with the guide, from the waiting room until the Tour ends; the live page shows it in its own tab.
  const liveTab = useStudentStore(store => store.activeTab)
  const talking = !!info && !finished && !leave.isPending && (snapshot?.tourState === 'Running' || snapshot?.tourState === 'Ready' || snapshot?.tourState === 'Scheduled')
  const talk = useStudentTalk(tourId, talking, snapshot?.tourState !== 'Running' || liveTab === 'talk')
  // ADR-0063: the fallback video's token, held while the Tour runs so the player switches as soon as the live picture is lost.
  const fallback = useStudentFallbackAccess(tourId, snapshot?.tourState === 'Running' && !!info?.hasFallbackVideo && !leave.isPending)
  const status = <>
    {leave.isError && <p role="alert" className="st-session-error">{accessError(leave.error)}</p>}
    {info && session.isError && !finished && <p role="alert" className="st-session-error">Đang mất kết nối; thông tin hiển thị có thể đã cũ. Phiên có thể hết hạn trong thời gian mất kết nối; kết nối lại để kiểm tra.</p>}
    {session.isError && !left && !unchecked && !endedBy && <button type="button" className="st-session-retry" disabled={session.isFetching || join.isPending || leave.isPending} onClick={() => void session.refetch()}>Kiểm tra lại phiên</button>}
  </>

  let body
  if (session.isPending && !left && !slow) {
    body = <section className="st-invitation-card"><p aria-busy="true">Đang kiểm tra phiên…</p><div className="st-loading-lines" aria-hidden="true"><span /><span /><span /></div></section>
  } else if (!info || !snapshot) {
    body = <div className="st-ctn st-entry-layout">
      {/* Code entry comes first in the DOM, so a phone shows it before the photo; wide screens place it right. */}
      <section className="st-invitation-card st-entry-form" aria-labelledby="student-access-title">
        {unchecked && <div className="st-session-unchecked" role="status">
          <p>Chưa kiểm tra được phiên</p>
          <button type="button" className="st-session-retry" disabled={join.isPending || leave.isPending} onClick={retryCheck}>Thử lại</button>
        </div>}
        <form onSubmit={event => { event.preventDefault(); join.mutate() }}>
          <div className="st-entry-form-heading"><Mail size={24} aria-hidden="true" /><h2 id="student-access-title">Nhập mã truy cập</h2></div>
          <p>Sao chép mã trong email lời mời. Mỗi lời mời dùng trên một trình duyệt; không cần tài khoản học sinh.</p>
          <label htmlFor="invitation-code">Mã truy cập</label>
          <div className="st-entry-code-field"><KeyRound size={18} aria-hidden="true" />
          <input id="invitation-code" autoComplete="off" maxLength={64} value={code} disabled={join.isPending} onChange={event => setCode(event.target.value)}
            aria-invalid={join.isError} aria-describedby={join.isError ? 'invitation-code-error' : undefined} required />
          </div>
          {join.isError && <p id="invitation-code-error" role="alert" className="st-session-error">{accessError(join.error)}</p>}
          {ended && <p role="alert" className="st-session-error">{SESSION_ENDED}</p>}
          {session.isError && !unchecked && !(session.error instanceof ApiError && session.error.status === 401) && <p role="alert" className="st-session-error">{accessError(session.error)}</p>}
          <button className="st-btn st-invitation-submit" aria-busy={join.isPending} disabled={join.isPending || !code.trim()}>{ENTER_TOUR_LABEL}</button>
          <p className="st-invitation-note"><LifeBuoy size={18} aria-hidden="true" /><span>Mất email hoặc mã đang bị dùng? Liên hệ đại diện đoàn để gửi lại hoặc cấp mã mới.</span></p>
        </form>
        {status}
      </section>
      <section className="st-entry-story" aria-labelledby="student-discover-title">
        <div className="st-entry-intro">
          <h2 id="student-discover-title">Khám phá campus{' '}<br />cùng robot.</h2>
          <p>Ghé thăm những không gian mới, nghe thuyết minh và đặt câu hỏi ngay trong chuyến tham quan.</p>
        </div>
        <figure className="st-entry-photo">
          <img src="/images/student-campus.png" width={1672} height={941} alt="Minh họa khuôn viên với robot và sinh viên" fetchPriority="high" />
          <figcaption><Bot size={18} aria-hidden="true" /><span>Một góc nhìn mới về campus</span></figcaption>
        </figure>
        <ul className="st-entry-features" aria-label="Trải nghiệm tham quan">
          <li><Bot size={19} aria-hidden="true" /><span>Đồng hành cùng robot</span></li>
          <li><Captions size={19} aria-hidden="true" /><span>Nghe thuyết minh</span></li>
          <li><MessageSquare size={19} aria-hidden="true" /><span>Hỏi Trợ lý AI</span></li>
        </ul>
      </section>
    </div>
  } else if (snapshot.tourState === 'Running') {
    body = <>
      <StudentLiveView
        snapshot={snapshot}
        quest={quest}
        fallback={fallback}
        showMap={false}
        idleTitle="Buổi tham quan đang diễn ra"
        notice={<StudentBallotBox tourId={tourId} ballot={ballot} locked={locked} shared={shared} />}
        narrationIdleText={snapshot.step === 'in_progress'
          ? 'Thuyết minh sẽ hiện khi robot tới từng điểm dừng. Trong lúc chờ, bạn xem thẻ Lộ trình hoặc hỏi Trợ lý AI nhé.'
          : undefined}
        video={{
          emptyMessage: 'Livestream chưa được kết nối cho buổi này. Bạn vẫn có thể theo dõi lộ trình và hỏi Trợ lý AI.',
        }}
        ai={<LiveStudentAiAssistant tourId={tourId} shared={shared} poiName={snapshot.currentPoi?.title} chat={aiChat} />}
        talk={<StudentTalkPanel tourId={tourId} talk={talk} shared={shared} />}
        talkUnread={talk.unread}
      />
      <div className="st-ctn st-invitation-status">{status}</div>
    </>
  } else if (snapshot.tourState === 'Completed' || snapshot.tourState === 'Cancelled') {
    body = <>
      {/* The session answers 200 CANCELLED only for a Tour that started (End Early); TOUR_ENDED CANCELLED means it never ran.
          Neither plays anything: after End Early only the result remains (FR-48, ADR-0063). */}
      <StudentEndScreen snapshot={snapshot} name="bạn" meta={`${info.tourName}, ${formatDateTime(info.scheduledStartAt)}`}
        neverStarted={endedBy?.tourState === 'CANCELLED'}
        onLeave={leave.isPending ? undefined : () => finished ? exitSession() : leave.mutate()} />
      <div className="st-ctn st-invitation-status">{status}</div>
    </>
  } else {
    body = <>
      <StudentWaitingRoom
        snapshot={snapshot}
        heading="Bạn đã vào phòng chờ"
        intro={`${sessionLabel}. Khi nhân viên vận hành bắt đầu buổi tham quan, trang này sẽ tự chuyển sang buổi tham quan trực tiếp. Mã còn hạn tới ${formatDateTime(info.invitationExpiresAt)}.`}
        meta={`${info.tourName}, Giờ dự kiến ${formatDateTime(info.scheduledStartAt)}`}
        showMicCheck={false}
        talk={<StudentTalkPanel tourId={tourId} talk={talk} shared={shared} waiting />}
        assistant={<WaitingRoomAssistant tourId={tourId} scheduledStartAt={info.scheduledStartAt} shared={shared} chat={aiChat} />}
      />
      <div className="st-ctn st-invitation-status">{status}</div>
    </>
  }

  return <div className={info ? 'lp st st-x' : 'lp st st-x st--entry'}>
    <a className="st-skip" href="#student-main">Đến nội dung chính</a>
    <StudentHeader
      session={null}
      tourName={info?.tourName ?? 'Tham gia Tour được mời'}
      isLive={info?.tourState === 'RUNNING'}
      liveLabel="Trực tiếp"
      portalLabel={info ? sessionLabel : undefined}
      onLeave={info ? () => finished ? exitSession() : leave.mutate() : undefined}
      leaveLabel="Thoát phiên"
      leaveDisabled={leave.isPending}
    />
    <main id="student-main" tabIndex={-1} className="st-main">{body}</main>
  </div>
}

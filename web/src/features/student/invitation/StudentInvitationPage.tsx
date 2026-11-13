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
import { FALLBACK_BADGE } from '../components/StudentVideoPlayer'
import { useStudentStreamAccess } from '../../quest-stream/stream-access'
import { formatDateTime } from '../../../components/ui/date-time'
import { ENTER_TOUR_LABEL } from './invitation-labels'
import { buildLiveSnapshot, getStudentTourView, isVideoFile, type StudentTourInfo } from './student-tour-view'
import '../student.css'
import '../student-expedition.css'
import './invitation.css'

const path = (id: string) => `/api/student/tours/${encodeURIComponent(id)}`
async function access(tourId: string, action: string, code?: string, signal?: AbortSignal) {
  return (await apiClient<ApiResponse<StudentTourInfo | null>>(`${path(tourId)}/${action}`, {
    method: 'POST', credentials: 'include', auth: false, signal, ...(code ? { json: { accessCode: code } } : {}),
  })).data
}
function accessError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 400) return 'Mã truy cập không hợp lệ. Kiểm tra mã trong email rồi thử lại.'
    if (error.status === 401) return 'Mã hoặc phiên đã hết hạn, bị thu hồi hoặc không thuộc Tour này.'
    if (error.status === 403) return 'Nguồn truy cập không được phép. Liên hệ quản trị hệ thống để kiểm tra cấu hình truy cập.'
    if (error.status === 409) return 'Lời mời đang được dùng trên browser khác. Liên hệ đại diện để thu hồi và cấp mã mới.'
    if (error.status === 429) return 'Bạn đã thử quá nhiều lần. Đợi một phút rồi thử lại.'
  }
  return 'Không kết nối được hệ thống. Vui lòng thử lại.'
}
export const SESSION_CHECK_RUNNING_MS = 5000
/** The page never waits silently longer than this for the first session check. */
export const SESSION_CHECK_WATCHDOG_MS = 8000
/** Cancelled, offline or server-side failures say nothing about the invitation itself. */
const uncheckedError = (error: unknown) => !(error instanceof ApiError) || error.status >= 500

function FallbackVideoLink({ url }: { url: string | null }) {
  if (!url) return null
  return <p className="st-invitation-fallback">
    <a href={url} target="_blank" rel="noreferrer">Xem video giới thiệu (không phải trực tiếp)</a>
  </p>
}

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
  const join = useMutation({ mutationFn: () => access(tourId, 'join', code),
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: info => { setCode(''); setLeft(false); client.setQueryData(key, info) } })
  const leave = useMutation({ mutationFn: () => access(tourId, 'leave'),
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: () => { setLeft(true); client.setQueryData(key, null); join.reset() } })
  const sessionEnabled = !left && !join.isPending && !leave.isPending
  // A heartbeat begun before join/leave must not overwrite the mutation's committed state.
  const session = useQuery({ queryKey: key, queryFn: ({ signal }) => access(tourId, 'session', undefined, signal),
    retry: false, enabled: sessionEnabled, refetchIntervalInBackground: true,
    // SRS v1.9: a revoked or reissued invitation must stop playback within 10 s,
    // so a running Tour re-checks the session every 5 s.
    refetchInterval: query => query.state.data?.tourState === 'RUNNING' ? SESSION_CHECK_RUNNING_MS : 30000 })
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
  const info = left || accessDenied ? null : session.data
  // Route and progress; a failure only hides the stops, the session above stays the access authority.
  const view = useQuery({ queryKey: ['student-tour-view', tourId], queryFn: ({ signal }) => getStudentTourView(tourId, signal),
    retry: false, enabled: !!info && !leave.isPending, refetchInterval: info?.tourState === 'RUNNING' ? 5000 : 30000 })

  const unchecked = !left && !info && ((session.isPending && slow) || (session.isError && uncheckedError(session.error)))
  const shared = info?.rowType === 'SHARED_VIEWING'
  const sessionLabel = shared ? 'Màn hình xem chung' : 'Phiên lời mời cá nhân'
  const snapshot = info ? buildLiveSnapshot(info, view.data) : null
  const fallback = info?.fallbackVideoUrl ?? null
  // ADR-0055: the relay URL and a short token, renewed while the Tour runs; refused once access ends.
  const quest = useStudentStreamAccess(tourId, snapshot?.tourState === 'Running' && !leave.isPending)
  const status = <>
    {leave.isError && <p role="alert" className="st-session-error">{accessError(leave.error)}</p>}
    {info && session.isError && <p role="alert" className="st-session-error">Đang mất kết nối; thông tin hiển thị có thể đã cũ. Phiên có thể hết hạn trong thời gian mất kết nối; kết nối lại để kiểm tra.</p>}
    {session.isError && !left && !unchecked && <button type="button" className="st-session-retry" disabled={session.isFetching || join.isPending || leave.isPending} onClick={() => void session.refetch()}>Kiểm tra lại phiên</button>}
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
          <p>Sao chép mã trong email lời mời. Mỗi lời mời dùng trên một browser; không cần tài khoản học sinh.</p>
          <label htmlFor="invitation-code">Mã truy cập</label>
          <div className="st-entry-code-field"><KeyRound size={18} aria-hidden="true" />
          <input id="invitation-code" autoComplete="off" maxLength={64} value={code} disabled={join.isPending} onChange={event => setCode(event.target.value)}
            aria-invalid={join.isError} aria-describedby={join.isError ? 'invitation-code-error' : undefined} required />
          </div>
          {join.isError && <p id="invitation-code-error" role="alert" className="st-session-error">{accessError(join.error)}</p>}
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
        showMap={false}
        idleTitle="Buổi tham quan đang diễn ra"
        narrationIdleText={snapshot.step === 'in_progress'
          ? 'Thuyết minh sẽ hiện khi robot tới từng điểm dừng. Trong lúc chờ, bạn xem thẻ Lộ trình hoặc hỏi Trợ lý AI nhé.'
          : undefined}
        video={{
          badge: snapshot.videoStreamUrl ? FALLBACK_BADGE : undefined,
          emptyMessage: 'Livestream chưa được kết nối cho buổi này. Bạn vẫn có thể theo dõi lộ trình và hỏi Trợ lý AI.',
        }}
        notice={!isVideoFile(fallback) && <FallbackVideoLink url={fallback} />}
        ai={<LiveStudentAiAssistant tourId={tourId} shared={shared} poiName={snapshot.currentPoi?.title} />}
      />
      <div className="st-ctn st-invitation-status">{status}</div>
    </>
  } else if (snapshot.tourState === 'Completed' || snapshot.tourState === 'Cancelled') {
    body = <>
      <StudentEndScreen snapshot={snapshot} name="bạn" meta={`${info.tourName}, ${formatDateTime(info.scheduledStartAt)}`}
        onLeave={leave.isPending ? undefined : () => leave.mutate()} />
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
      onLeave={info ? () => leave.mutate() : undefined}
      leaveLabel="Thoát phiên"
      leaveDisabled={leave.isPending}
    />
    <main id="student-main" tabIndex={-1} className="st-main">{body}</main>
  </div>
}

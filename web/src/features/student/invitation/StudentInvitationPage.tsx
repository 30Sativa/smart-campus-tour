import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'
import { StudentHeader } from '../components/StudentHeader'
import { StudentWaitingRoom } from '../components/StudentWaitingRoom'
import { StudentLiveView } from '../components/StudentLiveView'
import { StudentEndScreen } from '../components/StudentEndScreen'
import { LiveStudentAiAssistant } from '../components/LiveStudentAiAssistant'
import { buildLiveSnapshot, getStudentTourView, isVideoFile, type StudentTourInfo } from './student-tour-view'
import '../../landing/landing.css'
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
const date = (stamp: string) => new Date(stamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })

/** The drifting light behind every student screen (decorative). */
function Backdrop() {
  return <div className="st-x-bg" aria-hidden="true"><i /><i /><i /></div>
}

function FallbackVideoLink({ url }: { url: string | null }) {
  if (!url) return null
  return <p className="st-invitation-fallback">
    <a href={url} target="_blank" rel="noreferrer">Xem video dự phòng</a>
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
  // A heartbeat begun before join/leave must not overwrite the mutation's committed state.
  const session = useQuery({ queryKey: key, queryFn: ({ signal }) => access(tourId, 'session', undefined, signal),
    retry: false, enabled: !left && !join.isPending && !leave.isPending, refetchInterval: 30000, refetchIntervalInBackground: true })
  const accessDenied = session.isError && session.error instanceof ApiError && [401, 403, 409].includes(session.error.status)
  const info = left || accessDenied ? null : session.data
  // Route and progress; a failure only hides the stops, the session above stays the access authority.
  const view = useQuery({ queryKey: ['student-tour-view', tourId], queryFn: ({ signal }) => getStudentTourView(tourId, signal),
    retry: false, enabled: !!info && !leave.isPending, refetchInterval: info?.tourState === 'RUNNING' ? 5000 : 30000 })

  const shared = info?.rowType === 'SHARED_VIEWING'
  const sessionLabel = shared ? 'Màn hình xem chung' : 'Phiên lời mời cá nhân'
  const snapshot = info ? buildLiveSnapshot(info, view.data) : null
  const fallback = info?.fallbackVideoUrl ?? null
  const status = <>
    {leave.isError && <p role="alert" className="mt-3 text-sm text-red-700">{accessError(leave.error)}</p>}
    {info && session.isError && <p role="alert" className="mt-3 text-sm text-red-700">Đang mất kết nối; thông tin hiển thị có thể đã cũ. Phiên có thể hết hạn trong thời gian mất kết nối; kết nối lại để kiểm tra.</p>}
    {session.isError && !left && <button type="button" className="mt-3 underline" disabled={session.isFetching || join.isPending || leave.isPending} onClick={() => void session.refetch()}>Kiểm tra lại phiên</button>}
  </>

  let body
  if (session.isPending && !left) {
    body = <section className="st-invitation-card"><p aria-busy="true">Đang kiểm tra phiên…</p></section>
  } else if (!info || !snapshot) {
    body = <section className="st-invitation-card">
      <form onSubmit={event => { event.preventDefault(); join.mutate() }}>
        <h2 className="mb-3 text-2xl font-semibold">Nhập mã truy cập</h2>
        <p className="mb-5 text-sm text-slate-600">Sao chép mã trong email lời mời. Mỗi lời mời dùng trên một browser; không cần tài khoản học sinh.</p>
        <label className="block font-medium" htmlFor="invitation-code">Mã truy cập</label>
        <input id="invitation-code" autoComplete="off" maxLength={64} value={code} disabled={join.isPending} onChange={event => setCode(event.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono text-lg" required />
        {join.isError && <p role="alert" className="mt-3 text-sm text-red-700">{accessError(join.error)}</p>}
        {session.isError && !(session.error instanceof ApiError && session.error.status === 401) && <p role="alert" className="mt-3 text-sm text-red-700">{accessError(session.error)}</p>}
        <button className="st-btn st-invitation-submit" disabled={join.isPending || !code.trim()}>Vào Tour</button>
        <p className="mt-4 text-sm text-slate-600">Mất email hoặc mã đang bị dùng? Liên hệ đại diện đoàn để gửi lại hoặc cấp mã mới.</p>
      </form>
      {status}
    </section>
  } else if (snapshot.tourState === 'Running') {
    body = <>
      <StudentLiveView
        snapshot={snapshot}
        showMap={false}
        idleTitle="Buổi tham quan đang diễn ra"
        narrationIdleText={snapshot.step === 'in_progress'
          ? 'Thuyết minh sẽ hiện khi robot tới từng điểm dừng. Trong lúc chờ, bạn xem thẻ Lộ trình hoặc hỏi Trợ lý AI nhé.'
          : undefined}
        video={{
          badge: snapshot.videoStreamUrl ? 'Video dự phòng' : undefined,
          emptyMessage: 'Livestream chưa được kết nối cho buổi này. Bạn vẫn có thể theo dõi lộ trình và hỏi Trợ lý AI.',
        }}
        notice={!isVideoFile(fallback) && <FallbackVideoLink url={fallback} />}
        ai={<LiveStudentAiAssistant tourId={tourId} shared={shared} poiName={snapshot.currentPoi?.title} />}
      />
      <div className="st-ctn st-invitation-status">{status}</div>
    </>
  } else if (snapshot.tourState === 'Completed' || snapshot.tourState === 'Cancelled') {
    body = <>
      <StudentEndScreen snapshot={snapshot} name="bạn" meta={`${info.tourName} • ${date(info.scheduledStartAt)}`}
        onLeave={leave.isPending ? undefined : () => leave.mutate()} />
      <div className="st-ctn st-invitation-status">{status}</div>
    </>
  } else {
    body = <>
      <StudentWaitingRoom
        snapshot={snapshot}
        heading="Bạn đã vào phòng chờ"
        intro={`${sessionLabel}. Khi nhân viên vận hành bắt đầu buổi tham quan, trang này sẽ tự chuyển sang buổi tham quan trực tiếp. Mã còn hạn tới ${date(info.invitationExpiresAt)}.`}
        meta={`${info.tourName} • Giờ dự kiến ${date(info.scheduledStartAt)}`}
        showMicCheck={false}
      >
        <FallbackVideoLink url={fallback} />
      </StudentWaitingRoom>
      <div className="st-ctn st-invitation-status">{status}</div>
    </>
  }

  return <div className={info ? 'lp st st-x' : 'lp st st-x st--entry'}>
    <Backdrop />
    <StudentHeader
      session={null}
      tourName={info?.tourName ?? 'Tham gia Tour được mời'}
      isLive={info?.tourState === 'RUNNING'}
      liveLabel="LIVE"
      portalLabel={info ? sessionLabel : undefined}
      onLeave={info ? () => leave.mutate() : undefined}
      leaveLabel="Thoát phiên"
      leaveDisabled={leave.isPending}
    />
    <main className="st-main">{body}</main>
  </div>
}

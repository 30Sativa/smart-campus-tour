import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'
import '../student.css'
import '../../landing/landing.css'
import './invitation.css'

type TourInfo = { tourId: string; tourName: string; tourState: string; scheduledStartAt: string; invitationExpiresAt: string; rowType: string; fallbackVideoUrl: string | null }
const path = (id: string) => `/api/student/tours/${encodeURIComponent(id)}`
async function access(tourId: string, action: string, code?: string, signal?: AbortSignal) {
  return (await apiClient<ApiResponse<TourInfo | null>>(`${path(tourId)}/${action}`, {
    method: 'POST', credentials: 'include', auth: false, signal, ...(code ? { json: { accessCode: code } } : {}),
  })).data
}
function accessError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Mã hoặc phiên đã hết hạn, bị thu hồi hoặc không thuộc Tour này.'
    if (error.status === 409) return 'Lời mời đang được dùng trên browser khác. Liên hệ đại diện để thu hồi và cấp mã mới.'
    if (error.status === 429) return 'Bạn đã thử quá nhiều lần. Đợi một phút rồi thử lại.'
  }
  return 'Không kết nối được hệ thống. Vui lòng thử lại.'
}
export function StudentInvitationPage({ tourId }: { tourId: string }) {
  const client = useQueryClient()
  const key = ['student-invitation', tourId]
  const [code, setCode] = useState('')
  const [left, setLeft] = useState(false)
  const session = useQuery({ queryKey: key, queryFn: ({ signal }) => access(tourId, 'session', undefined, signal),
    retry: false, enabled: !left, refetchInterval: 30000, refetchIntervalInBackground: true })
  const join = useMutation({ mutationFn: () => access(tourId, 'join', code),
    onSuccess: info => { setCode(''); setLeft(false); client.setQueryData(key, info) } })
  const leave = useMutation({ mutationFn: () => access(tourId, 'leave'),
    onSuccess: () => { setLeft(true); client.setQueryData(key, null); join.reset() } })
  const expired = session.isError && session.error instanceof ApiError && session.error.status === 401
  const info = left || expired ? null : session.data
  const date = (stamp: string) => new Date(stamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  return <div className="lp st st--entry">
    <header className="st-header"><div className="st-ctn st-header__inner">
      <div className="st-brand"><img className="st-brand__mark" src="/images/logo.png" alt="" width={40} height={40} /><div><span className="st-brand__name">CampusTour</span><h1 className="st-brand__title">{info?.tourName ?? 'Tham gia Tour được mời'}</h1></div></div>
      {info && <button className="st-leave" disabled={leave.isPending} onClick={() => leave.mutate()}>Thoát phiên</button>}
    </div></header>
    <main className="st-main"><section className="st-invitation-card">
      {session.isPending && !left ? <p aria-busy="true">Đang kiểm tra phiên…</p> : info ? <>
        <h2 className="mb-3 text-2xl font-semibold">{info.tourState === 'RUNNING' ? 'Tour đang diễn ra' : info.tourState === 'CANCELLED' ? 'Tour đã kết thúc sớm' : 'Bạn đã vào phòng chờ'}</h2>
        <p>{info.tourName} · {date(info.scheduledStartAt)}</p>
        <p className="mt-2 text-sm">{info.rowType === 'SHARED_VIEWING' ? 'Phiên dành cho màn hình xem chung.' : 'Phiên lời mời cá nhân.'} Mã còn hạn tới {date(info.invitationExpiresAt)}.</p>
        {info.fallbackVideoUrl ? <a className="mt-4 inline-block underline" href={info.fallbackVideoUrl} target="_blank" rel="noreferrer">Xem video dự phòng</a>
          : <p className="mt-4 text-sm text-slate-600">{info.tourState === 'RUNNING' ? 'Livestream và nội dung hướng dẫn chưa được kết nối cho buổi này.' : 'Buổi tham quan sẽ bắt đầu khi nhân viên vận hành mở Tour.'}</p>}
      </> : <form onSubmit={event => { event.preventDefault(); join.mutate() }}>
        <h2 className="mb-3 text-2xl font-semibold">Nhập mã truy cập</h2>
        <p className="mb-5 text-sm text-slate-600">Sao chép mã trong email lời mời. Mỗi lời mời dùng trên một browser; không cần tài khoản học sinh.</p>
        <label className="block font-medium" htmlFor="invitation-code">Mã truy cập</label>
        <input id="invitation-code" autoComplete="off" maxLength={64} value={code} onChange={event => setCode(event.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono text-lg" required />
        {join.isError && <p role="alert" className="mt-3 text-sm text-red-700">{accessError(join.error)}</p>}
        {session.isError && !(session.error instanceof ApiError && session.error.status === 401) && <p role="alert" className="mt-3 text-sm text-red-700">{accessError(session.error)}</p>}
        <button className="st-btn st-invitation-submit" disabled={join.isPending || !code.trim()}>Vào Tour</button>
        <p className="mt-4 text-sm text-slate-600">Mất email hoặc mã đang bị dùng? Liên hệ đại diện đoàn để gửi lại hoặc cấp mã mới.</p>
      </form>}
      {leave.isError && <p role="alert" className="mt-3 text-sm text-red-700">{accessError(leave.error)}</p>}
      {info && session.isError && <p role="alert" className="mt-3 text-sm text-red-700">Đang mất kết nối; thông tin hiển thị có thể đã cũ. Phiên được giữ tối đa 10 phút để kết nối lại.</p>}
    </section></main>
  </div>
}

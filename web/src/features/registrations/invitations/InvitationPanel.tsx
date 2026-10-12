import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../api/client'
import { useAuthStore } from '../../../stores/auth-store'
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog'
import { buttonClass } from '../../../components/ui/ui-classes'
import { invitationsApi, type InvitationItem, type InvitationWrite } from './api'

const statusLabel = { NOT_REQUESTED: 'Chưa gửi', PENDING: 'Đang chờ gửi', ACCEPTED: 'Dịch vụ chấp nhận gửi', FAILED: 'Gửi thất bại', UNKNOWN: 'Chưa biết kết quả' }
const time = (stamp: string) => new Date(stamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'Dữ liệu hoặc quyền thao tác đã thay đổi. Tải lại trước khi tiếp tục; gửi lại cần cách nhau một phút.'
    if (error.status === 403 || error.status === 404) return 'Bạn không có quyền hỗ trợ đăng ký này.'
  }
  return 'Không xác nhận được kết quả. Thử lại cùng yêu cầu hoặc tải lại danh sách.'
}
export function InvitationPanel({ registrationId, rowVersion, tourRowVersion }: { registrationId: string; rowVersion: string; tourRowVersion: string }) {
  const owner = useAuthStore(s => s.user?.userId)
  const client = useQueryClient()
  const key = ['registration-invitations', owner, registrationId]
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => invitationsApi.get(registrationId, signal),
    enabled: Boolean(owner), retry: false, refetchInterval: 5000 })
  const mutation = useMutation({ mutationFn: (write: InvitationWrite) => invitationsApi.write(registrationId, write),
    onSuccess: () => client.invalidateQueries({ queryKey: key }) })
  const [choice, setChoice] = useState<InvitationWrite | null>(null)
  const [saved, setSaved] = useState(false)
  const choose = (operation: InvitationWrite['operation'], item?: InvitationItem) => {
    mutation.reset(); setSaved(false)
    setChoice({ operation, invitationId: item?.id, requestId: crypto.randomUUID(),
      expectedRowVersion: item?.rowVersion ?? rowVersion, ...(item ? {} : { expectedTourRowVersion: tourRowVersion }) })
  }
  const submit = () => {
    if (!choice) return
    mutation.mutate(choice, { onSuccess: () => { setChoice(null); setSaved(true) },
      onError: failure => { if (failure instanceof ApiError && failure.status === 409) { setChoice(null); void query.refetch() } } })
  }
  return <section aria-label="Hỗ trợ lời mời" className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold text-slate-900">Lời mời và email</h2>
      <button className={buttonClass('secondary', 'sm')} disabled={query.isFetching || mutation.isPending} onClick={() => void query.refetch()}>Tải lại lời mời</button>
    </div>
    {query.isPending && <p aria-busy="true">Đang tải lời mời…</p>}
    {query.isError && <p role="alert">Không tải được lời mời. Vui lòng thử tải lại.</p>}
    {mutation.isError && <p role="alert" className="mb-3 text-sm text-red-700">{message(mutation.error)}</p>}
    {saved && <p role="status" className="mb-3 text-sm text-emerald-700">Đã lưu thao tác. Kết quả gửi email sẽ cập nhật ở danh sách.</p>}
    {query.data && !query.isError && <>
      {!query.data.enabled && <p>Hỗ trợ lời mời chưa được bật. Liên hệ quản trị hệ thống.</p>}
      {query.data.canIssue && <button className={buttonClass('primary', 'sm')} disabled={mutation.isPending} onClick={() => choose('issue')}>Cấp và gửi lời mời</button>}
      {query.data.enabled && query.data.items.length === 0 && !query.data.canIssue && <p>Đăng ký này chưa có lời mời được cấp.</p>}
      <div className="mt-3 space-y-3">{query.data.items.map(item => <article key={item.id} className="rounded-lg border border-slate-200 p-3">
        <p className="font-medium text-slate-900">{item.displayName} <span className="text-xs text-slate-500">· {item.rowType === 'SHARED_VIEWING' ? 'Điểm xem chung' : 'Cá nhân'}</span></p>
        <p className="break-all text-sm text-slate-600">{item.email}</p>
        <p className="mt-1 text-sm">{item.revokedAt ? 'Đã thu hồi mã' : new Date(item.expiresAt) <= new Date() ? 'Mã đã hết hạn' : 'Mã còn hiệu lực'} · Hạn: {time(item.expiresAt)}</p>
        <p className="text-sm">{statusLabel[item.emailStatus] ?? 'Chưa biết kết quả'}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className={buttonClass('secondary', 'sm')} disabled={!item.canSend || mutation.isPending || query.isFetching} onClick={() => choose('resend', item)}>Gửi lại email</button>
          <button className={buttonClass('secondary', 'sm')} disabled={!item.canReissue || mutation.isPending || query.isFetching} onClick={() => choose('reissue', item)}>Thu hồi và cấp mã mới</button>
          <button className={buttonClass('danger', 'sm')} disabled={!item.canRevoke || mutation.isPending || query.isFetching} onClick={() => choose('revoke', item)}>Thu hồi mã</button>
        </div>
      </article>)}</div>
      {query.data.items.length > 0 && <p className="mt-3 text-xs text-slate-500">Gửi lại giữ nguyên mã và phiên đang xem. Cấp mã mới ngắt phiên cũ, giữ nguyên hạn. Dịch vụ chấp nhận gửi chưa xác nhận người nhận đã nhận thư.</p>}
    </>}
    <ConfirmationDialog open={choice !== null} title={choice?.operation === 'issue' ? 'Cấp và gửi lời mời?' : choice?.operation === 'resend' ? 'Gửi lại email?' : choice?.operation === 'reissue' ? 'Thu hồi và cấp mã mới?' : 'Thu hồi mã?'}
      description={choice?.operation === 'issue' ? 'Mỗi dòng đã duyệt sẽ nhận một email riêng gồm lịch, link Tour và mã truy cập.' : choice?.operation === 'resend' ? 'Gửi cùng mã hiện hành tới email đã duyệt; phiên đang xem được giữ nguyên.' : choice?.operation === 'reissue' ? 'Mã và mọi phiên cũ sẽ bị thu hồi ngay. Mã mới giữ nguyên hạn; gửi email lỗi không khôi phục mã cũ.' : 'Mã và mọi phiên đang dùng lời mời này sẽ ngừng hiệu lực.'}
      confirmLabel={choice?.operation === 'resend' ? 'Gửi lại' : choice?.operation === 'issue' ? 'Cấp và gửi' : 'Xác nhận thu hồi'}
      withReason={false}
      tone={choice?.operation === 'revoke' || choice?.operation === 'reissue' ? 'danger' : 'default'} busy={mutation.isPending}
      error={mutation.isError ? message(mutation.error) : undefined} onConfirm={submit} onCancel={() => { if (!mutation.isPending) setChoice(null) }} />
  </section>
}

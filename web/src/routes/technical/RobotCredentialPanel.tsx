import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound, RotateCcw, ShieldAlert } from 'lucide-react'
import { buttonClass, inputClass, labelClass } from '../../components/ui/ui-classes'
import { Modal } from '../../components/ui/Drawer'
import { errorText, stamp } from '../../features/technical/technical-format'
import { technicalApi, type RobotCredentialSecret } from '../../features/technical/api/technical'

export function RobotCredentialPanel({ robotCode, onClose }: { robotCode: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const credential = useQuery({ queryKey: ['technical', 'robot-credential', robotCode], queryFn: () => technicalApi.getRobotCredential(robotCode) })
  const [pending, setPending] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [oneTimeSecret, setOneTimeSecret] = useState<RobotCredentialSecret | null>(null)
  const clearAndClose = () => { setOneTimeSecret(null); onClose() }
  const refreshRobotViews = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['technical', 'robot-credential', robotCode] }),
    // The deployment-check picker uses this same physical-robot query.
    queryClient.invalidateQueries({ queryKey: ['technical', 'physical-robots'] }),
  ])

  const change = async (operation: 'issue' | 'rotate' | 'revoke') => {
    const current = credential.data
    if (!current || pending) return
    if (operation !== 'issue' && !window.confirm('MiniPC sẽ mất kết nối cho tới khi được cấu hình khóa mới. Tiếp tục?')) return
    if (operation === 'revoke' && !reason.trim()) { setError('Nhập lý do thu hồi.'); return }
    setPending(true)
    setError(null)
    try {
      const input = { requestId: crypto.randomUUID(), expectedRowVersion: current.rowVersion }
      if (operation === 'revoke') {
        await technicalApi.revokeRobotCredential(robotCode, { ...input, reason: reason.trim() })
      } else {
        const secret = operation === 'issue'
          ? await technicalApi.issueRobotCredential(robotCode, input)
          : await technicalApi.rotateRobotCredential(robotCode, input)
        setOneTimeSecret(secret)
      }
      await refreshRobotViews()
    } catch (cause) {
      setError(errorText(cause))
      await refreshRobotViews()
    } finally { setPending(false) }
  }

  return <Modal open title={`Khóa Fleet Sync · ${robotCode}`} description="Quản lý khóa của robot. Bí mật chỉ xuất hiện trong phản hồi cấp hoặc cấp lại." onClose={clearAndClose}
    footer={<div className="flex justify-end"><button type="button" className={buttonClass('secondary')} onClick={clearAndClose}>Đóng</button></div>}>
    {credential.isPending ? <p role="status" className="p-4">Đang tải trạng thái khóa…</p> : credential.isError ? <div role="alert" className="p-4 text-sm text-red-700">{errorText(credential.error)} <button className="underline" onClick={() => void credential.refetch()}>Thử lại</button></div> : credential.data && <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 p-3 text-sm">
        <p><strong>Trạng thái:</strong> {credential.data.status === 'ACTIVE' ? `Đang hoạt động · …${credential.data.hint ?? '????'}` : credential.data.status === 'REVOKED' ? 'Đã thu hồi' : 'Chưa cấp'}</p>
        {credential.data.issuedAt && <p className="mt-1">Cấp lúc {stamp(credential.data.issuedAt)} · {credential.data.issuedByName ?? 'cấp qua CLI'}</p>}
        {credential.data.revokedAt && <p className="mt-1">Thu hồi lúc {stamp(credential.data.revokedAt)} · {credential.data.revokedByName ?? '—'}</p>}
      </section>
      {credential.data.status !== 'ACTIVE' ? <button type="button" disabled={pending} className={buttonClass('primary')} onClick={() => void change('issue')}><KeyRound size={15} aria-hidden="true" />Cấp khóa</button> : <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} className={buttonClass('secondary')} onClick={() => void change('rotate')}><RotateCcw size={15} aria-hidden="true" />Cấp lại</button>
        <button type="button" disabled={pending} className={buttonClass('danger')} onClick={() => void change('revoke')}><ShieldAlert size={15} aria-hidden="true" />Thu hồi</button>
      </div>}
      {credential.data.status === 'ACTIVE' && <p className="text-xs text-amber-800">Cấp lại hoặc thu hồi sẽ ngắt MiniPC cho tới khi được cấu hình lại.</p>}
      {credential.data.status === 'ACTIVE' && <div><label className={labelClass} htmlFor="credential-revoke-reason">Lý do thu hồi</label><input id="credential-revoke-reason" className={`${inputClass} mt-1`} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></div>}
      {pending && <p role="status" className="text-sm text-slate-600">Đang cập nhật khóa…</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {oneTimeSecret && <div role="dialog" aria-modal="true" aria-label="Khóa hiển thị một lần" className="rounded-lg border border-amber-300 bg-amber-50 p-3">
        <p className="font-semibold text-amber-900">Khóa chỉ hiển thị một lần</p><p className="mt-1 text-xs text-amber-900">Lưu khóa vào file credential riêng của MiniPC. Đóng mục này sẽ xóa bí mật khỏi giao diện.</p>
        <code className="mt-2 block break-all rounded bg-white p-2 text-sm">{oneTimeSecret.secret}</code>
        <button type="button" className={`${buttonClass('secondary', 'sm')} mt-2`} onClick={() => void navigator.clipboard?.writeText(oneTimeSecret.secret)}><Copy size={14} aria-hidden="true" />Sao chép</button>
        <button type="button" className={`${buttonClass('secondary', 'sm')} ml-2 mt-2`} onClick={() => setOneTimeSecret(null)}>Đã lưu, xóa khỏi màn hình</button>
      </div>}
    </div>}
  </Modal>
}

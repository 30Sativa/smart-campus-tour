import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound, RotateCcw, ShieldAlert } from 'lucide-react'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { buttonClass } from '../../components/ui/ui-classes'
import { Modal } from '../../components/ui/Drawer'
import { errorText } from '../../features/technical/technical-format'
import { formatDateTime } from '../../components/ui/date-time'
import { technicalApi, type RobotCredentialSecret } from '../../features/technical/api/technical'
import { useRobotCredential } from '../../features/technical/technical-hooks'

export function RobotCredentialPanel({ robotCode, onClose }: { robotCode: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const credential = useRobotCredential(robotCode)
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState<'rotate' | 'revoke' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [oneTimeSecret, setOneTimeSecret] = useState<RobotCredentialSecret | null>(null)
  // Escape reaches both overlays; while the confirmation is up it only closes that.
  const clearAndClose = () => { if (confirming) return; setOneTimeSecret(null); onClose() }
  const refreshRobotViews = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['technical', 'robot-credential', robotCode] }),
    // The deployment-check picker uses this same physical-robot query.
    queryClient.invalidateQueries({ queryKey: ['technical', 'physical-robots'] }),
  ])

  const change = async (operation: 'issue' | 'rotate' | 'revoke', reason = '') => {
    const current = credential.data
    if (!current || pending) return
    setPending(true)
    setError(null)
    try {
      const input = { requestId: crypto.randomUUID(), expectedRowVersion: current.rowVersion }
      if (operation === 'revoke') {
        await technicalApi.revokeRobotCredential(robotCode, { ...input, reason })
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

  return <><Modal open title={`Khóa Fleet Sync · ${robotCode}`} description="Quản lý khóa của robot. Bí mật chỉ xuất hiện trong phản hồi cấp hoặc cấp lại." onClose={clearAndClose}
    footer={<div className="flex justify-end"><button type="button" className={buttonClass('secondary')} onClick={clearAndClose}>Đóng</button></div>}>
    {credential.isPending ? <p role="status" className="p-4">Đang tải trạng thái khóa…</p> : credential.isError ? <div role="alert" className="p-4 text-sm text-red-700">{errorText(credential.error)} <button className="underline" onClick={() => void credential.refetch()}>Thử lại</button></div> : credential.data && <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 p-3 text-sm">
        <p><strong>Trạng thái:</strong> {credential.data.status === 'ACTIVE' ? `Đang hoạt động · …${credential.data.hint ?? '????'}` : credential.data.status === 'REVOKED' ? 'Đã thu hồi' : 'Chưa cấp'}</p>
        {credential.data.issuedAt && <p className="mt-1">Cấp lúc {formatDateTime(credential.data.issuedAt)} · {credential.data.issuedByName ?? 'cấp qua CLI'}</p>}
        {credential.data.revokedAt && <p className="mt-1">Thu hồi lúc {formatDateTime(credential.data.revokedAt)} · {credential.data.revokedByName ?? '-'}</p>}
      </section>
      {credential.data.status !== 'ACTIVE' ? <button type="button" disabled={pending} className={buttonClass('primary')} onClick={() => void change('issue')}><KeyRound size={15} aria-hidden="true" />Cấp khóa</button> : <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} className={buttonClass('secondary')} onClick={() => setConfirming('rotate')}><RotateCcw size={15} aria-hidden="true" />Cấp lại</button>
        <button type="button" disabled={pending} className={buttonClass('danger')} onClick={() => setConfirming('revoke')}><ShieldAlert size={15} aria-hidden="true" />Thu hồi</button>
      </div>}
      {credential.data.status === 'ACTIVE' && <p className="text-xs text-amber-800">Cấp lại hoặc thu hồi sẽ ngắt MiniPC cho tới khi được cấu hình lại.</p>}
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
  {confirming && <ConfirmationDialog open tone="danger" withReason={confirming === 'revoke'} requireReason reasonLabel="Lý do thu hồi" reasonPlaceholder="Ghi lại vì sao cần thu hồi khóa…"
    title={confirming === 'revoke' ? `Thu hồi khóa của ${robotCode}?` : `Cấp lại khóa của ${robotCode}?`}
    description="MiniPC sẽ mất kết nối cho tới khi được cấu hình khóa mới."
    confirmLabel={confirming === 'revoke' ? 'Thu hồi khóa' : 'Cấp lại khóa'}
    onConfirm={reason => { setConfirming(null); void change(confirming, reason) }} onCancel={() => setConfirming(null)} />}
  </>
}

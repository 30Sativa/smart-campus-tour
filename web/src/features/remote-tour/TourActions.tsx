import { useState } from 'react'
import type { ActionOption, RemoteTour } from '../../api/contracts/remote-tour'
import { remotePreviewApi } from '../../mocks/remote-tour-mock'
import { useRemoteMutation } from './remote-hooks'
import { buttonClass, Confirmation, Field, inputClass, MutationError } from './RemoteUi'

export function TourActions({ tour, options }: { tour: RemoteTour; options: ActionOption[] }) {
  const [pending, setPending] = useState<ActionOption | null>(null)
  const [reason, setReason] = useState('')
  const command = useRemoteMutation((option: ActionOption) => remotePreviewApi.command(tour.id, tour.revision, option.action, true, reason))
  return <div className="space-y-3"><div className="flex flex-wrap gap-3">{options.map(option => <div key={option.action} className="max-w-xs"><button title={option.reason} className={buttonClass} disabled={Boolean(option.reason) || command.isPending} onClick={() => { if (['hold', 'next', 'ready', 'reopen'].includes(option.action)) command.mutate(option); else { setReason(''); setPending(option) } }}>{option.label}</button>{option.reason && <p className="mt-1 text-xs">{option.reason}</p>}</div>)}</div><MutationError error={command.error} /><Confirmation title={`Xác nhận ${pending?.label ?? 'thao tác'}`} open={Boolean(pending)} pending={command.isPending} error={command.error} onClose={() => setPending(null)} onConfirm={() => pending && command.mutate(pending, { onSuccess: () => setPending(null) })}>
    {pending?.action === 'start' ? <p>Xác nhận đã kiểm tra định vị, nguồn, robot, FRONT và video. Trong bản xem trước, thao tác chỉ chạy dữ liệu mô phỏng.</p> : pending?.action === 'complete' ? <p>Xác nhận nguồn hình đã được xử lý, chặng về thành công và robot đã dừng. Hoàn tất buổi mà không chạy lại chặng về.</p> : pending?.action.startsWith('retry-') ? <p>Xác nhận đã kiểm tra robot dừng, bước cũ kết thúc và nguyên nhân lỗi được xử lý. Chỉ thử lại bước đang hiển thị.</p> : <><p>Kết thúc buổi và đóng quyền live/AI. Đây là yêu cầu vận hành; không xác nhận robot đã dừng.</p><Field label="Lý do"><textarea className={inputClass} required value={reason} onChange={e => setReason(e.target.value)} /></Field></>}
  </Confirmation></div>
}

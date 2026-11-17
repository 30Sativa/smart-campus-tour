import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Lock, LocateFixed } from 'lucide-react'
import { buttonClass } from '../../../../components/ui/ui-classes'
import { HEAD_LOCK_TEXT, headKeys, headRefusal, useHeadCommand, useTourHeadStatus, type HeadReport } from './head-control'

/** What the head is doing, from the robot's own report (queued is not executed). */
function headLine(head: HeadReport | null): { text: string; homing: boolean; ok: boolean } {
  if (!head) return { text: 'Robot chưa báo trạng thái đầu camera.', homing: false, ok: false }
  if (head.state === 'HOMING') return { text: 'Đang canh chỉnh: đầu tìm vật chặn rồi về giữa, khoảng 15 giây.', homing: true, ok: false }
  if (head.state === 'MOVING') return { text: 'Đầu camera đang quay.', homing: false, ok: head.referenced }
  if (!head.referenced) return { text: 'Đầu camera chưa có mốc. Bấm Tự canh chỉnh trước khi bắt đầu.', homing: false, ok: false }
  return { text: 'Đầu camera đã có mốc và sẵn sàng.', homing: false, ok: true }
}

/**
 * "Tự canh chỉnh đầu camera" (ADR-0045 HOME): the robot turns PAN and TILT into their mechanical stops and back to the
 * front, so 0° is exact again before a Tour. Allowed for the Tour's Operator while the Tour is READY (the robot it holds)
 * or RUNNING. No confirmation, like every head press: the head never moves the robot.
 */
export function HeadHomeButton({ tourId, isOperator, operatorName, compact = false }: {
  tourId: string; isOperator: boolean; operatorName?: string | null; compact?: boolean
}) {
  const status = useTourHeadStatus(tourId, true)
  const command = useHeadCommand(tourId)
  const client = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const current = status.data ?? null
  const line = headLine(current?.head ?? null)
  const lock = !isOperator ? `Chỉ ${operatorName ?? 'người vận hành được giao'} mới canh chỉnh được đầu camera.`
    : current && !current.enabled ? HEAD_LOCK_TEXT.disabled
    : current && !current.robotCode ? 'Tour chưa giữ robot nào, nên chưa canh chỉnh được.'
    : current && !current.connected ? HEAD_LOCK_TEXT.notConnected
    : null
  const busy = command.isPending || line.homing

  const home = () => command.mutate({ kind: 'HOME' }, {
    // Read the robot's report again at once, so "Đang canh chỉnh" shows without waiting for the next 2 s poll.
    onSuccess: () => { setMessage(null); void client.invalidateQueries({ queryKey: headKeys.status(tourId) }) },
    onError: error => {
      const refusal = headRefusal(error)
      setMessage(refusal.lock === 'notRunning' ? 'Chỉ canh chỉnh được khi Tour đã chốt và giữ robot, hoặc đang chạy.' : refusal.message)
    },
  })

  return <div className="space-y-2">
    <button type="button" className={`${buttonClass(compact ? 'secondary' : 'primary', 'sm')} w-full`} disabled={Boolean(lock) || busy}
      onClick={home} aria-describedby={compact && lock ? undefined : `head-home-${tourId}`}>
      <LocateFixed size={16} aria-hidden="true" />{line.homing ? 'Đang canh chỉnh…' : 'Tự canh chỉnh đầu camera'}
    </button>
    {/* Compact (inside the live head panel): that panel already says why its buttons are locked. */}
    {!(compact && lock) && <p id={`head-home-${tourId}`} role="status" className={`flex items-start gap-1.5 text-xs leading-5 ${lock ? 'font-semibold text-[#7d5310]' : line.ok ? 'text-[#236344]' : 'text-muted'}`}>
      {lock && <Lock size={13} className="mt-1 shrink-0" aria-hidden="true" />}
      {lock ?? line.text}
    </p>}
    {message && <p role="alert" className="text-[13px] leading-5 font-semibold text-[#9d3428]">{message}</p>}
  </div>
}

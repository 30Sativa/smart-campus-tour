import { useState } from 'react'
import { CircleStop, Hand, RotateCcw, SkipForward, Undo2, Flag, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ApiError } from '../../../api/client'
import type { TourCommand, TourOperation } from '../../../api/contracts/staff'
import { useTourCommand } from '../staff-hooks'
import { buttonClass } from '../ui-classes'
import { REASON_GUIDE, REASON_SHORT } from '../reason'
import { ConfirmationDialog } from './ConfirmationDialog'

type Recovery = Extract<TourCommand, 'retryLeg' | 'rerunPoi' | 'retryFront' | 'confirmComplete'>

const RECOVERY: Record<Recovery, { label: string; icon: LucideIcon; confirm: string }> = {
  retryLeg: { label: 'Thử lại chặng', icon: RotateCcw, confirm: 'Gửi lại mục tiêu chặng hiện tại với mã chặng mới. Chỉ làm khi đã xác nhận robot đứng yên và đường đi thông.' },
  rerunPoi: { label: 'Chạy lại POI', icon: Undo2, confirm: 'Mở lượt dừng mới tại POI: quay góc đầu, chờ ổn định hình, thuyết minh và thời gian dừng bắt đầu lại từ đầu.' },
  retryFront: { label: 'Thử lại FRONT', icon: Wrench, confirm: 'Gửi lại lệnh quay FRONT với mã lệnh mới. Chặng kế chỉ được gửi sau khi FRONT hoàn tất.' },
  confirmComplete: { label: 'Xác nhận hoàn tất', icon: Flag, confirm: 'Robot đã về và dừng tại điểm kết thúc. Xác nhận để đóng buổi ở trạng thái Hoàn thành.' },
}

const DONE: Record<TourCommand, string> = {
  hold: 'Đã giữ tại POI: robot không tự đi tiếp khi hết thời gian dừng.',
  next: 'Đã đóng lượt dừng; robot quay FRONT rồi sang chặng kế.',
  endEarly: 'Đã kết thúc sớm. Robot được giữ tới khi xác nhận đã dừng.',
  retryLeg: 'Đã gửi lại chặng với mã mới.',
  rerunPoi: 'Đã mở lượt dừng mới tại POI.',
  retryFront: 'Đã gửi lại lệnh FRONT.',
  confirmComplete: 'Buổi đã hoàn thành.',
}

function errorText(error: unknown) {
  return error instanceof ApiError && error.body ? error.body : 'Không gửi được thao tác. Kiểm tra kết nối rồi thử lại.'
}

/**
 * Tour Controls (scope §4.2, §11.5, §12.2).
 *
 * Normal flow: Hold at a POI and Next - frequent, so no confirmation. When the
 * Tour needs assistance: the reason, what to check, and only the recoveries
 * the server allows right now, each confirmed because it moves hardware. End
 * Early sits apart, always confirmed with a reason. A disabled button always
 * has its reason printed under it; the server re-checks every request.
 */
export function OperationControls({ tour }: { tour: TourOperation }) {
  const command = useTourCommand()
  const [pending, setPending] = useState<Recovery | 'endEarly' | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const actions = tour.allowedActions
  const assist = tour.operationalStatus === 'NeedsAssistance'

  const send = (cmd: TourCommand, reason?: string) => {
    setMessage(null)
    command.mutate(
      { tourId: tour.id, command: cmd, reason },
      {
        onSuccess: () => {
          setMessage({ tone: 'ok', text: DONE[cmd] })
          setPending(null)
        },
        onError: (error) => setMessage({ tone: 'error', text: errorText(error) }),
      },
    )
  }

  if (tour.state !== 'Running') {
    return <p className="rounded-xl bg-[#f7f7f3] px-4 py-3 text-sm text-[#6b6e75]">Thao tác vận hành chỉ có khi buổi đang chạy.</p>
  }

  const recoveries = (Object.keys(RECOVERY) as Recovery[]).filter((key) => actions[key].allowed)

  return (
    <div>
      {assist ? (
        <div className="rounded-xl border border-[#ffe3a3] bg-[#fffcf2] p-4">
          <p className="text-sm font-extrabold text-[#b23e31]">Cần hỗ trợ · {tour.reason ? REASON_SHORT[tour.reason] ?? tour.reason : ''}</p>
          {tour.reasonDetail && <p className="mt-1 text-[13px] leading-5 text-[#44474e]">{tour.reasonDetail}</p>}
          {tour.reason && REASON_GUIDE[tour.reason] && <p className="mt-2 text-xs leading-5 text-[#74777d]">{REASON_GUIDE[tour.reason]}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {recoveries.map((key) => {
              const { label, icon: Icon } = RECOVERY[key]
              return <button key={key} type="button" onClick={() => setPending(key)} className={`${buttonClass('primary', 'sm')} w-full`}><Icon size={15} aria-hidden="true" />{label}</button>
            })}
          </div>
          {recoveries.length === 0 && (
            <p className="mt-2 text-xs font-semibold text-[#8a5a06]">
              Chưa có thao tác phục hồi hợp lệ: {actions.rerunPoi.reason ?? actions.retryLeg.reason ?? 'chờ trạng thái robot rõ ràng'}.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => send('hold')} disabled={!actions.hold.allowed || command.isPending} className={buttonClass('secondary', 'lg')} aria-describedby={`gate-hold-${tour.id}`}>
              <Hand size={18} aria-hidden="true" />{tour.progress?.hold ? 'Đang giữ' : 'Giữ tại POI'}
            </button>
            <button type="button" onClick={() => send('next')} disabled={!actions.next.allowed || command.isPending} className={buttonClass('primary', 'lg')} aria-describedby={`gate-next-${tour.id}`}>
              <SkipForward size={18} aria-hidden="true" />Đi tiếp
            </button>
          </div>
          <div className="mt-2 space-y-0.5 text-xs leading-5 text-[#8e9096]">
            {!actions.hold.allowed && actions.hold.reason && <p id={`gate-hold-${tour.id}`}>Giữ: {actions.hold.reason}</p>}
            {!actions.next.allowed && actions.next.reason && <p id={`gate-next-${tour.id}`}>Đi tiếp: {actions.next.reason}</p>}
            {tour.progress?.hold && <p className="font-semibold text-[#3d5010]">Đang giữ tại POI. Bấm Đi tiếp khi muốn rời điểm.</p>}
          </div>
        </>
      )}

      {message && (
        <p role={message.tone === 'ok' ? 'status' : 'alert'} className={`mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold transition-opacity duration-300 starting:opacity-0 ${message.tone === 'ok' ? 'bg-[#f2f7e4] text-[#4d6410]' : 'bg-[#fff1ef] text-[#b23e31]'}`}>
          {message.text}
        </p>
      )}

      <div className="mt-4 border-t border-[#efefe9] pt-4">
        <button type="button" onClick={() => setPending('endEarly')} disabled={!actions.endEarly.allowed} className={`${buttonClass('danger')} w-full`}>
          <CircleStop size={16} aria-hidden="true" />Kết thúc sớm
        </button>
        <p className="mt-2 text-[11px] leading-4 text-[#999ba0]">Kết thúc sớm là yêu cầu hủy qua mạng, không phải dừng khẩn cấp. Dừng khẩn cấp dùng cơ chế an toàn trên robot.</p>
      </div>

      <ConfirmationDialog
        open={pending === 'endEarly'}
        tone="danger"
        title={`Kết thúc sớm ${tour.code}?`}
        description={<>Buổi chuyển sang <strong>Đã hủy</strong>, đóng live và AI của học sinh, gửi yêu cầu hủy nhiệm vụ robot. Robot được giữ tới khi xác nhận đã dừng. Không thể mở lại buổi này.</>}
        confirmLabel="Kết thúc sớm"
        requireReason
        busy={command.isPending}
        error={pending === 'endEarly' && message?.tone === 'error' ? message.text : null}
        onCancel={() => setPending(null)}
        onConfirm={(reason) => send('endEarly', reason)}
      />
      {pending && pending !== 'endEarly' && (
        <ConfirmationDialog
          open
          title={`${RECOVERY[pending].label} · ${tour.code}?`}
          description={<>{RECOVERY[pending].confirm} <strong>Chỉ thực hiện khi đã kiểm tra thực tế lỗi đã hết.</strong></>}
          confirmLabel={RECOVERY[pending].label}
          reasonLabel="Đã kiểm tra gì"
          busy={command.isPending}
          error={message?.tone === 'error' ? message.text : null}
          onCancel={() => setPending(null)}
          onConfirm={(reason) => send(pending, reason)}
        />
      )}
    </div>
  )
}

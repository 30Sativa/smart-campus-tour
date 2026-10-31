import { useState } from 'react'
import { Link } from 'react-router'
import { CircleStop, Hand, Play, RotateCcw, ShieldAlert, SkipForward, Undo2, Flag, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ApiError } from '../../../api/client'
import type { TourCommand, TourOperation } from '../../../api/contracts/staff'
import { useTourCommand } from '../staff-hooks'
import { buttonClass } from '../../../components/ui/ui-classes'
import { REASON_GUIDE, REASON_SHORT } from '../reason'
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog'
import { celebrate, notify } from '../../../components/ui/toast-store'

type Recovery = Extract<TourCommand, 'retryLeg' | 'rerunPoi' | 'retryFront' | 'confirmComplete'>

const RECOVERY: Record<Recovery, { label: string; icon: LucideIcon; confirm: string }> = {
  retryLeg: { label: 'Thử lại chặng', icon: RotateCcw, confirm: 'Gửi lại mục tiêu chặng hiện tại với mã chặng mới. Chỉ làm khi đã xác nhận robot đứng yên và đường đi thông.' },
  rerunPoi: { label: 'Chạy lại POI', icon: Undo2, confirm: 'Mở lượt dừng mới tại POI: quay góc đầu, chờ ổn định hình, thuyết minh và thời gian dừng bắt đầu lại từ đầu.' },
  retryFront: { label: 'Thử lại FRONT', icon: Wrench, confirm: 'Gửi lại lệnh quay FRONT với mã lệnh mới. Chặng kế chỉ được gửi sau khi FRONT hoàn tất.' },
  confirmComplete: { label: 'Xác nhận hoàn tất', icon: Flag, confirm: 'Robot đã về và dừng tại điểm kết thúc. Xác nhận để đóng buổi ở trạng thái Hoàn thành.' },
}

const DONE: Record<TourCommand, { title: string; detail: string }> = {
  hold: { title: 'Đã giữ tại POI', detail: 'Robot không tự đi tiếp khi hết thời gian dừng.' },
  next: { title: 'Đã đóng lượt dừng', detail: 'Robot quay FRONT rồi sang chặng kế.' },
  endEarly: { title: 'Đã kết thúc sớm', detail: 'Robot được giữ tới khi xác nhận đã dừng.' },
  retryLeg: { title: 'Đã gửi lại chặng', detail: 'Lệnh mang mã mới; theo dõi vị trí robot trên dải trạng thái.' },
  rerunPoi: { title: 'Đã mở lượt dừng mới tại POI', detail: 'Thời gian dừng được tính lại từ đầu.' },
  retryFront: { title: 'Đã gửi lại lệnh FRONT', detail: 'Kiểm tra khung hình camera sau khi robot quay xong.' },
  confirmComplete: { title: 'Buổi đã hoàn thành', detail: 'Nhật ký buổi đã được lưu vào Lịch sử phiên.' },
}

/*
 * Visual order of the controls. One filled blue button at a time is the next
 * normal step (Start when Ready, Next while Running). Hold is orange and
 * outlined: it changes the flow but is not a stop. End Early is the only red
 * button and sits alone in its own zone at the bottom.
 */
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2'
const START_CLASS = `flex min-h-16 w-full items-center justify-center gap-2.5 rounded-2xl bg-linear-to-r from-[#2d719e] to-[#3a87b8] px-5 text-base font-bold text-white shadow-[0_10px_24px_-10px_rgba(45,113,158,0.85)] transition-[filter,transform] hover:brightness-110 active:scale-[0.99] ${FOCUS}`
const NEXT_CLASS = `flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#2d719e] px-4 text-[15px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(45,113,158,0.75)] transition-[background-color,transform] hover:bg-[#245e84] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#e3edf4] disabled:text-[#8fa8bb] disabled:shadow-none disabled:active:scale-100 ${FOCUS}`
const HOLD_CLASS = `flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#fdba74] bg-[#fff7ed] px-4 text-sm font-bold text-[#c2410c] transition-[background-color,transform] hover:bg-[#ffedd5] active:scale-[0.99] disabled:cursor-not-allowed disabled:border-[#e2e8f0] disabled:bg-[#f8fafc] disabled:text-[#94a3b8] disabled:active:scale-100 ${FOCUS}`
const END_CLASS = `flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#c53030] px-4 text-sm font-bold text-white shadow-[0_8px_20px_-10px_rgba(197,48,48,0.8)] transition-[background-color,transform] hover:bg-[#a82828] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:active:scale-100 ${FOCUS}`

function errorText(error: unknown) {
  return error instanceof ApiError && error.body ? error.body : 'Không gửi được thao tác. Kiểm tra kết nối rồi thử lại.'
}

/**
 * SRS v1.9 §3.2.c incident order: safety stop, fallback, one state-appropriate
 * recovery attempt, then End Early if still unsafe or unrecoverable.
 */
const INCIDENT_STEPS = [
  { title: 'Dừng an toàn', text: 'Robot đã đứng yên: tự dừng khi mất heartbeat, hoặc người phụ trách an toàn bấm dừng khẩn cấp.' },
  { title: 'Chuyển fallback', text: 'Người xem được chuyển sang video dự phòng có nhãn. Đây là chế độ suy giảm.' },
  { title: 'Thử phục hồi một lần', text: 'Chỉ một thao tác phù hợp trạng thái hiện tại, sau khi đã kiểm tra thực tế.' },
  { title: 'Kết thúc sớm nếu chưa an toàn', text: 'Nếu vẫn không an toàn hoặc không khắc phục được, kết thúc sớm và ghi lý do.' },
] as const

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
  const [message, setMessage] = useState<{ tone: 'error'; text: string } | null>(null)
  const actions = tour.allowedActions
  const assist = tour.operationalStatus === 'NeedsAssistance'
  // One recovery attempt per incident (an incident = this Tour needing assistance
  // for this reason). Kept in the page; the server should enforce the same rule.
  const incident = assist ? `${tour.id}:${tour.reason ?? ''}` : null
  const [attempted, setAttempted] = useState<string | null>(null)
  if (attempted && attempted !== incident) setAttempted(null)
  const recoveryUsed = incident !== null && attempted === incident

  const send = (cmd: TourCommand, reason?: string) => {
    setMessage(null)
    command.mutate(
      { tourId: tour.id, command: cmd, reason },
      {
        onSuccess: () => {
          if (cmd === 'confirmComplete') {
            celebrate({ title: `${tour.code} · ${DONE[cmd].title}`, detail: DONE[cmd].detail, action: { label: 'Xem lịch sử phiên', to: '/staff/history' } })
          } else {
            notify({ tone: cmd === 'endEarly' ? 'info' : 'success', title: `${tour.code} · ${DONE[cmd].title}`, detail: DONE[cmd].detail })
          }
          setPending(null)
          if (cmd in RECOVERY && cmd !== 'confirmComplete') setAttempted(incident)
        },
        onError: (error) => setMessage({ tone: 'error', text: errorText(error) }),
      },
    )
  }

  if (tour.state === 'Ready') {
    // Start itself happens on the start-check page (checklist + confirm); this is the way there.
    return (
      <div>
        <Link to={`/staff/tours/${tour.id}/start`} className={START_CLASS}>
          <Play size={20} aria-hidden="true" />Kiểm tra & bắt đầu
        </Link>
        <p className="mt-2 text-xs leading-5 text-[#64748b]">
          {actions.start.allowed ? 'Mở danh sách kiểm tra trước khi robot chạy.' : `Chưa thể bắt đầu: ${actions.start.reason ?? 'chờ đủ điều kiện'}.`}
        </p>
      </div>
    )
  }
  if (tour.state !== 'Running') {
    return <p className="rounded-xl bg-[#f5f8fd] px-4 py-3 text-sm text-[#647793]">Thao tác vận hành chỉ có khi buổi đang chạy.</p>
  }

  const recoveries = (Object.keys(RECOVERY) as Recovery[]).filter((key) => actions[key].allowed)

  return (
    <div>
      {assist ? (
        <div className="rounded-xl border border-[#ffe3a3] bg-[#fffcf2] p-4">
          <p className="text-sm font-bold text-[#b23e31]">Cần hỗ trợ · {tour.reason ? REASON_SHORT[tour.reason] ?? tour.reason : ''}</p>
          {tour.reasonDetail && <p className="mt-1 text-[13px] leading-5 text-[#40546f]">{tour.reasonDetail}</p>}
          {tour.reason && REASON_GUIDE[tour.reason] && <p className="mt-2 text-xs leading-5 text-[#71819a]">{REASON_GUIDE[tour.reason]}</p>}
          <ol className="mt-3 space-y-2" aria-label="Trình tự xử lý sự cố">
            {INCIDENT_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-2.5 text-[12.5px] leading-5 text-[#40546f]">
                <span aria-hidden="true" className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${index === 2 && recoveryUsed ? 'bg-[#e2e8f0] text-[#64748b]' : index === 3 && recoveryUsed ? 'bg-[#b23e31] text-white' : 'bg-[#fff2d9] text-[#8a5a06]'}`}>{index + 1}</span>
                <span><b className="text-[#173b59]">{step.title}.</b> {step.text}</span>
              </li>
            ))}
          </ol>
          {recoveryUsed ? (
            <p className="mt-3 text-xs font-semibold text-[#b23e31]">Đã thử phục hồi một lần cho sự cố này. Nếu vẫn chưa an toàn hoặc chưa khắc phục được, hãy Kết thúc sớm.</p>
          ) : (
            <>
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
            </>
          )}
        </div>
      ) : (
        <>
          {tour.progress?.hold && (
            <p role="status" className="mb-3 flex items-center gap-2 rounded-xl border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-[12.5px] font-semibold text-[#c2410c]">
              <Hand size={15} aria-hidden="true" />Đang giữ tại POI. Bấm Đi tiếp khi muốn rời điểm.
            </p>
          )}
          <div className="grid gap-2">
            <button type="button" onClick={() => send('next')} disabled={!actions.next.allowed || command.isPending} className={NEXT_CLASS} aria-describedby={`gate-next-${tour.id}`}>
              <SkipForward size={20} aria-hidden="true" />Đi tiếp
            </button>
            <button type="button" onClick={() => send('hold')} disabled={!actions.hold.allowed || command.isPending} className={HOLD_CLASS} aria-describedby={`gate-hold-${tour.id}`}>
              <Hand size={17} aria-hidden="true" />{tour.progress?.hold ? 'Đang giữ' : 'Giữ tại POI'}
            </button>
          </div>
          <div className="mt-2 space-y-0.5 text-xs leading-5 text-[#8a98ac]">
            {!actions.next.allowed && actions.next.reason && <p id={`gate-next-${tour.id}`}>Đi tiếp: {actions.next.reason}</p>}
            {!actions.hold.allowed && actions.hold.reason && <p id={`gate-hold-${tour.id}`}>Giữ: {actions.hold.reason}</p>}
          </div>
        </>
      )}

      {message && (
        <p role="alert" className="mt-3 rounded-xl bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31] transition-opacity duration-300 starting:opacity-0">
          {message.text}
        </p>
      )}

      <div className="mt-5 rounded-2xl border border-dashed border-[#f5c8c2] bg-[#fffafa] p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-[0.06em] text-[#b23e31] uppercase">
          <ShieldAlert size={13} aria-hidden="true" />Vùng khẩn cấp
        </p>
        <button type="button" onClick={() => setPending('endEarly')} disabled={!actions.endEarly.allowed} className={END_CLASS}>
          <CircleStop size={17} aria-hidden="true" />Kết thúc sớm
        </button>
        <p className="mt-2 text-[11px] leading-4 text-[#8a98ac]">Kết thúc sớm là yêu cầu hủy qua mạng, không phải dừng khẩn cấp. Dừng khẩn cấp dùng cơ chế an toàn trên robot.</p>
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

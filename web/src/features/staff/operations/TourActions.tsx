import { useState, type ReactNode } from 'react'
import { ArrowRight, CircleStop, FileCheck2, RotateCcw } from 'lucide-react'
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog'
import { notify } from '../../../components/ui/toast-store'
import { buttonClass } from '../../../components/ui/ui-classes'
import type { TourActionAvailability, TourDetails } from '../../administration/tours/types'
import { useEndTourEarly, useIntentRequestIds, useNextStop, useReconcileCommand, useRetryLeg } from './hooks'
import { checkInfo } from './operation-labels'
import { operationRefusal } from './operation-errors'
import { actionGate, endEarlyEffect, type ConsoleAction } from './situation'
import { BlockerList } from './StartCheckList'

/** The server's refusal in words: its reason, then the labels of the checks it named. */
function gateText(gate: TourActionAvailability): string {
  const checks = gate.blockedBy.filter(id => checkInfo(id).group !== 'other').map(id => checkInfo(id).label)
  return [gate.reason, ...checks].filter(Boolean).join(' · ')
}

type Mutation = { isPending: boolean; error: unknown; isError: boolean; reset: () => void }

/**
 * One operation behind a confirmation. Enabled only while the server allows it
 * (`gate`) and, for an operation that makes the robot move, only while the Tour
 * on screen is current (`frozen`). If the server withdraws it while the dialog is
 * open, the dialog says so and cannot confirm. Success is said only after the
 * server answered 200.
 */
function GatedAction({ id, label, icon, gate, frozen, variant = 'primary', hint, dialog, mutation, submit }: {
  id: string
  label: string
  icon: ReactNode
  gate: TourActionAvailability | null
  frozen?: string | null
  variant?: 'primary' | 'danger'
  /** Said under an enabled button: what pressing it does. */
  hint: string
  dialog: { title: string; confirmLabel: string; busyLabel: string; description: ReactNode; reason?: { label: string; placeholder: string } }
  mutation: Mutation
  submit: (reason: string) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const allowed = Boolean(gate?.allowed) && !frozen
  // Said inside an open dialog when the server withdrew the operation or the screen stopped updating meanwhile.
  const withdrawn = !gate ? null : !gate.allowed ? `Máy chủ vừa báo thao tác này không còn được phép: ${gateText(gate)}` : frozen ?? null
  const refusal = mutation.isError ? operationRefusal(mutation.error, { operator: true }) : null
  const note = !gate ? 'Máy chủ chưa trả quyền cho thao tác này.' : !gate.allowed ? `Chưa thực hiện được: ${gateText(gate)}` : frozen ?? hint
  const button = variant === 'danger'
    ? `${buttonClass('secondary', 'lg')} w-full !border-[#c9534a] !text-[#b23e31] hover:!bg-[#fff1ef]`
    : `${buttonClass('primary', 'lg')} w-full`
  return (
    <div>
      <button type="button" className={button} disabled={!allowed || mutation.isPending} aria-describedby={`${id}-note`}
        onClick={() => { mutation.reset(); setOpen(true) }}>{icon}{label}</button>
      <p id={`${id}-note`} className={`mt-1.5 text-[13px] leading-5 ${allowed ? 'text-[#64748b]' : 'text-[#7d5310]'}`}>{note}</p>
      {refusal?.checks && !open && <div className="mt-2"><BlockerList checks={refusal.checks} blockedBy={refusal.blockedBy} /></div>}
      <ConfirmationDialog open={open} title={dialog.title} confirmLabel={dialog.confirmLabel} busyLabel={dialog.busyLabel}
        tone={variant === 'danger' ? 'danger' : 'default'} description={dialog.description}
        withReason={Boolean(dialog.reason)} requireReason={Boolean(dialog.reason)} reasonLabel={dialog.reason?.label} reasonPlaceholder={dialog.reason?.placeholder}
        busy={mutation.isPending} error={refusal?.message ?? null}
        confirmDisabled={!mutation.isPending && (!gate?.allowed || Boolean(frozen))}
        onCancel={() => { if (!mutation.isPending) setOpen(false) }}
        onConfirm={reason => { submit(reason).then(() => setOpen(false), () => undefined) }}>
        {!mutation.isPending && withdrawn && <p role="alert" className="rounded-xl border border-[#f1dcb0] bg-[#fffaf0] px-3 py-2 text-sm font-semibold text-[#7d5310]">{withdrawn}</p>}
      </ConfirmationDialog>
    </div>
  )
}

/** The step the situation calls for: Next, Retry leg or Reconcile, each gated by the server. */
export function ConsoleActionButton({ action, detail, frozen }: { action: ConsoleAction; detail: TourDetails; frozen: string | null }) {
  const { tour } = detail
  const requestId = useIntentRequestIds()
  const next = useNextStop()
  const retry = useRetryLeg()
  const reconcile = useReconcileCommand()
  const gate = actionGate(detail, action)

  if (action === 'next') return <GatedAction id="next" label="Đi tiếp" icon={<ArrowRight size={18} aria-hidden="true" />} gate={gate} frozen={frozen}
    hint="Robot rời điểm dừng hiện tại khi bạn xác nhận."
    dialog={{ title: 'Đi tiếp?', confirmLabel: 'Đi tiếp', busyLabel: 'Đang gửi…',
      description: 'Máy chủ đóng lượt dừng hiện tại rồi tạo lệnh di chuyển tới điểm kế tiếp. Ở điểm dừng cuối, robot về điểm kết thúc hoặc Tour kết thúc tại đó, tùy cấu hình tuyến. Kiểm tra đường đi phía trước robot thông thoáng.' }}
    mutation={next}
    submit={() => next.mutateAsync({ id: tour.id, requestId: requestId(`next:${tour.id}:${tour.rowVersion}`), rowVersion: tour.rowVersion })
      .then(() => notify({ title: 'Đã gửi yêu cầu đi tiếp', detail: 'Theo dõi trạng thái lệnh robot của chặng mới.' }))} />

  if (action === 'retryLeg') return <GatedAction id="retry" label="Thử lại chặng" icon={<RotateCcw size={18} aria-hidden="true" />} gate={gate} frozen={frozen}
    hint="Máy chủ tạo một lệnh mới tới cùng điểm đích."
    dialog={{ title: 'Thử lại chặng?', confirmLabel: 'Thử lại', busyLabel: 'Đang gửi…',
      description: 'Máy chủ kiểm tra lại điều kiện di chuyển rồi tạo một lệnh mới tới cùng điểm đích. Chỉ thử lại khi đã xử lý nguyên nhân tại chỗ (đường bị chặn, robot sai bản đồ, robot đang bận) và đường đi phía trước robot thông thoáng.' }}
    mutation={retry}
    submit={() => retry.mutateAsync({ id: tour.id, requestId: requestId(`retry:${tour.id}:${tour.rowVersion}`), rowVersion: tour.rowVersion })
      .then(() => notify({ title: 'Đã tạo lệnh mới cho chặng', detail: 'Robot chưa di chuyển cho tới khi lấy lệnh. Theo dõi trạng thái lệnh.' }))} />

  const command = detail.execution?.command
  return <GatedAction id="reconcile" label="Đối soát lệnh" icon={<FileCheck2 size={18} aria-hidden="true" />} gate={command ? gate : null} variant="danger"
    hint="Chỉ dùng sau khi đã tới robot và xác nhận robot đứng yên an toàn."
    dialog={{ title: 'Đối soát lệnh chưa rõ kết quả?', confirmLabel: 'Đối soát', busyLabel: 'Đang đối soát…',
      description: <>Đối soát đóng lệnh mà <strong>không ghi kết quả</strong>: không ai biết robot đã tới đâu. Robot bị đánh dấu cần kỹ thuật viên kiểm tra tại chỗ, và một Tour đang chạy chỉ còn Kết thúc sớm. Chỉ đối soát khi đã xác nhận tại chỗ robot đứng yên an toàn.</>,
      reason: { label: 'Điều bạn thấy tại chỗ', placeholder: 'Ví dụ: đã tới robot, robot đứng yên cạnh cửa phòng 601, không còn di chuyển.' } }}
    mutation={reconcile}
    submit={reason => command
      ? reconcile.mutateAsync({ id: tour.id, commandId: command.id, requestId: requestId(`reconcile:${command.id}:${reason}`), reason })
        .then(() => notify({ title: 'Đã đối soát lệnh', detail: 'Robot chờ kỹ thuật viên kiểm tra tại chỗ.' }))
      : Promise.reject(new Error('Tour không còn lệnh để đối soát.'))} />
}

/**
 * End Early, kept apart from the forward actions and styled as a stop of the
 * Tour, not of the robot: the web page is not an Emergency Stop.
 */
export function EndEarlyAction({ detail }: { detail: TourDetails }) {
  const { tour } = detail
  const end = useEndTourEarly()
  const requestId = useIntentRequestIds()
  return <GatedAction id="end-early" label="Kết thúc sớm Tour" icon={<CircleStop size={18} aria-hidden="true" />} gate={actionGate(detail, 'endEarly')} variant="danger"
    hint="Dừng Tour, không dừng khẩn cấp robot."
    dialog={{ title: 'Kết thúc sớm Tour?', confirmLabel: 'Kết thúc sớm', busyLabel: 'Đang kết thúc…',
      description: <div className="space-y-2">
        <p>Tour chuyển sang Đã hủy và không chạy lại được. {endEarlyEffect(detail)}</p>
        <p>Robot được giữ lại cho tới khi kỹ thuật viên kiểm tra tại chỗ. Hệ thống chưa tự báo cho các đoàn hay tắt phát trực tiếp: báo cho đoàn theo cách thông thường.</p>
        <p className="font-semibold text-[#9d3428]">Đây không phải dừng khẩn cấp. Nếu robot cần dừng ngay, bấm nút dừng khẩn cấp trên robot.</p>
      </div>,
      reason: { label: 'Lý do kết thúc sớm', placeholder: 'Ví dụ: hành lang tầng 6 bị chặn, không thể tiếp tục.' } }}
    mutation={end}
    submit={reason => end.mutateAsync({ id: tour.id, requestId: requestId(`end:${tour.id}:${tour.rowVersion}:${reason}`), rowVersion: tour.rowVersion, reason })
      .then(() => notify({ title: `Đã kết thúc sớm Tour “${tour.name}”`, detail: 'Robot được giữ chờ kỹ thuật viên kiểm tra tại chỗ.' }))} />
}

import { formatTime } from '../../../components/ui/date-time'
import { useState, type ReactNode } from 'react'
import { ArrowRight, CircleStop, FileCheck2, Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog'
import { notify } from '../../../components/ui/toast-store'
import { buttonClass } from '../../../components/ui/ui-classes'
import type { StartConfirmation, TourActionAvailability, TourDetails } from '../../administration/tours/types'
import { useEndTourEarly, useIntentRequestIds, useNextStop, usePauseLeg, useReconcileCommand, useRetryLeg, useSetAutoAdvance, useSkipStop } from './hooks'
import { BACKUP_END, checkInfo } from './operation-labels'
import { ALL_REMAINING_LOCKED_TEXT, operationRefusal } from './operation-errors'
import { CONFIRMATIONS, NO_CONFIRMATION, isConfirmed } from './onsite-confirmations'
import { actionGate, endEarlyEffect, tourTargets, type ConsoleAction } from './situation'
import { BlockerList } from './StartCheckList'

/** The server's refusal in words: its reason, then the labels of the checks it named. */
function gateText(gate: TourActionAvailability): string {
  if (gate.blockedBy.includes('ALL_REMAINING_STOPS_LOCKED')) return ALL_REMAINING_LOCKED_TEXT
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
function GatedAction({ id, label, icon, gate, frozen, variant = 'primary', hint, disabledNote, dialog, mutation, submit }: {
  id: string
  label: string
  icon: ReactNode
  gate: TourActionAvailability | null
  frozen?: string | null
  variant?: 'primary' | 'danger' | 'secondary'
  /** Said under an enabled button: what pressing it does. */
  hint: string
  disabledNote?: string | null
  dialog: { title: string; confirmLabel: string; busyLabel: string; description: ReactNode; reason?: { label: string; placeholder: string } }
  mutation: Mutation
  submit: (reason: string) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const allowed = Boolean(gate?.allowed) && !frozen
  // Said inside an open dialog when the server withdrew the operation or the screen stopped updating meanwhile.
  const withdrawn = !gate ? null : !gate.allowed ? `Máy chủ vừa báo thao tác này không còn được phép: ${gateText(gate)}` : frozen ?? null
  const refusal = mutation.isError ? operationRefusal(mutation.error, { operator: true }) : null
  const note = !gate ? disabledNote ?? 'Máy chủ chưa trả quyền cho thao tác này.' : !gate.allowed ? disabledNote ?? `Chưa thực hiện được: ${gateText(gate)}` : frozen ?? hint
  const button = variant === 'danger'
    ? `${buttonClass('secondary', 'lg')} w-full !border-[#c9534a] !text-[#b23e31] hover:!bg-[#fff1ef]`
    : variant === 'secondary' ? `${buttonClass('secondary', 'md')} w-full`
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

/**
 * The step the situation calls for, each gated by the server: the departure from the start (its four on-site ticks are
 * the confirmation), Next, Pause, Resume or Retry, Skip and Reconcile, each behind one confirmation.
 */
export function ConsoleActionButton({ action, detail, frozen }: { action: ConsoleAction; detail: TourDetails; frozen: string | null }) {
  const { tour } = detail
  const requestId = useIntentRequestIds()
  const next = useNextStop()
  const retry = useRetryLeg()
  const pause = usePauseLeg()
  const skip = useSkipStop()
  const reconcile = useReconcileCommand()
  const gate = actionGate(detail, action)
  const targets = tourTargets(detail)
  const paused = detail.execution?.operationalStatus === 'PAUSED'

  if (action === 'depart') return <DepartAction detail={detail} gate={gate} frozen={frozen} />

  if (action === 'next') {
    const label = targets.next ? `Đi tới ${targets.next}` : 'Kết thúc Tour tại đây'
    return <GatedAction id="next" label={label} icon={<ArrowRight size={18} aria-hidden="true" />} gate={gate} frozen={frozen}
      hint={targets.next ? 'Robot rời điểm dừng hiện tại khi bạn xác nhận.' : 'Đây là điểm dừng cuối của tuyến.'}
      dialog={{ title: `${label}?`, confirmLabel: targets.next ? 'Đi tiếp' : 'Kết thúc', busyLabel: 'Đang gửi…',
        description: targets.next ? `${targets.voting && detail.execution?.currentStep === 'OBSERVING' ? 'Bầu chọn đóng ngay khi bạn xác nhận; robot đi tới điểm máy chủ chốt theo số phiếu. ' : ''}Kiểm tra đường đi phía trước robot thông thoáng rồi xác nhận.` : 'Tour hoàn thành tại điểm dừng này và robot được trả.' }}
      mutation={next}
      submit={() => next.mutateAsync({ id: tour.id, requestId: requestId(`next:${tour.id}:${tour.rowVersion}`), rowVersion: tour.rowVersion })
        .then(() => notify({ title: targets.next ? `Đã cho robot đi tới ${targets.next}` : 'Tour đã hoàn thành' }))} />
  }

  if (action === 'pause') return <GatedAction id="pause" label="Tạm dừng" icon={<Pause size={18} aria-hidden="true" />} gate={gate} frozen={null} variant="danger"
    hint="Robot dừng chặng này và chờ bạn bấm Tiếp tục. Không phải dừng khẩn cấp."
    dialog={{ title: 'Tạm dừng robot?', confirmLabel: 'Tạm dừng', busyLabel: 'Đang gửi…',
      description: 'Máy chủ gửi lệnh dừng chặng; robot dừng khi lấy được lệnh (thường 1–2 giây). Nếu nguy hiểm, bấm nút dừng khẩn cấp trên robot.' }}
    mutation={pause}
    submit={() => pause.mutateAsync({ id: tour.id, requestId: requestId(`pause:${tour.id}:${tour.rowVersion}`), rowVersion: tour.rowVersion })
      .then(() => notify({ title: 'Đã gửi yêu cầu tạm dừng', detail: 'Chờ robot báo đã dừng.' }))} />

  if (action === 'skip' && targets.voting) {
    // ADR-0065 rule 8: on a voting route Skip only drops every remaining (locked) POI and goes to the end.
    const label = 'Bỏ qua các điểm còn lại'
    return <GatedAction id="skip" label={label} icon={<SkipForward size={18} aria-hidden="true" />} gate={gate} frozen={frozen} variant="secondary"
      hint="Robot không tới các điểm đang tạm khóa và về thẳng điểm kết thúc."
      dialog={{ title: `${label}?`, confirmLabel: 'Bỏ qua', busyLabel: 'Đang gửi…',
        description: 'Các điểm đang tạm khóa không được tham quan trong Tour. Robot về điểm kết thúc và Tour hoàn thành khi tới nơi.' }}
      mutation={skip}
      submit={() => skip.mutateAsync({ id: tour.id, requestId: requestId(`skip:${tour.id}:${tour.rowVersion}`), rowVersion: tour.rowVersion })
        .then(() => notify({ title: 'Đã bỏ qua các điểm còn lại', detail: 'Robot về điểm kết thúc.' }))} />
  }

  if (action === 'skip') {
    const where = targets.afterSkip ?? 'kết thúc Tour'
    return <GatedAction id="skip" label={targets.skipped ? `Bỏ qua ${targets.skipped}` : 'Bỏ qua điểm dừng'} icon={<SkipForward size={18} aria-hidden="true" />}
      gate={gate} frozen={frozen} variant="secondary"
      hint={targets.afterSkip ? `Robot đi thẳng tới ${targets.afterSkip}.` : 'Đây là điểm cuối: Tour kết thúc tại đây.'}
      dialog={{ title: `Bỏ qua ${targets.skipped ?? 'điểm dừng này'}?`, confirmLabel: 'Bỏ qua', busyLabel: 'Đang gửi…',
        description: `Điểm này không được tham quan trong Tour. Robot ${targets.afterSkip ? `đi tới ${where}` : 'không đi thêm và Tour kết thúc'}.` }}
      mutation={skip}
      submit={() => skip.mutateAsync({ id: tour.id, requestId: requestId(`skip:${tour.id}:${tour.rowVersion}`), rowVersion: tour.rowVersion })
        .then(() => notify({ title: `Đã bỏ qua ${targets.skipped ?? 'điểm dừng'}` }))} />
  }

  if (action === 'retryLeg') {
    const label = paused ? `Tiếp tục tới ${targets.retry ?? 'điểm đích'}` : `Cho robot đi lại tới ${targets.retry ?? 'điểm đích'}`
    // ADR-0065: the leg's target was locked after it stopped, so the server re-chose where the new command goes.
    const rechosen = targets.retry !== targets.current
    return <GatedAction id="retry" label={label} icon={paused ? <Play size={18} aria-hidden="true" /> : <RotateCcw size={18} aria-hidden="true" />} gate={gate} frozen={frozen}
      hint={rechosen ? `Máy chủ tạo một lệnh mới tới ${targets.retry}; robot không tự chạy lại lệnh cũ.` : 'Máy chủ tạo một lệnh mới tới cùng điểm đích; robot không tự chạy lại lệnh cũ.'}
      dialog={{ title: `${label}?`, confirmLabel: paused ? 'Tiếp tục' : 'Đi lại', busyLabel: 'Đang gửi…',
        description: 'Kiểm tra đường đi phía trước robot thông thoáng và nguyên nhân dừng đã được xử lý tại chỗ.' }}
      mutation={retry}
      submit={() => retry.mutateAsync({ id: tour.id, requestId: requestId(`retry:${tour.id}:${tour.rowVersion}`), rowVersion: tour.rowVersion })
        .then(() => notify({ title: paused ? 'Đã cho robot tiếp tục' : 'Đã cho robot đi lại', detail: 'Theo dõi robot trên camera và bản đồ.' }))} />
  }

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
 * The departure from the start of an opened Tour: the four on-site confirmations are its explicit confirmation step,
 * ticked after looking at the live camera, map and robot on this page, so no dialog follows.
 */
function DepartAction({ detail, gate, frozen }: { detail: TourDetails; gate: TourActionAvailability | null; frozen: string | null }) {
  const { tour } = detail
  const next = useNextStop()
  const requestId = useIntentRequestIds()
  const [confirmation, setConfirmation] = useState<StartConfirmation>(NO_CONFIRMATION)
  const targets = tourTargets(detail)
  const confirmed = isConfirmed(confirmation)
  const refusal = next.isError ? operationRefusal(next.error, { operator: true }) : null
  // The server's gate is evaluated without the ticks (they live in this browser), so only their absence is added here.
  const allowed = Boolean(gate?.allowed) && !frozen && confirmed
  const note = !gate ? 'Máy chủ chưa trả quyền cho thao tác này.' : !gate.allowed ? `Chưa khởi hành được: ${gateText(gate)}`
    : frozen ?? (confirmed ? 'Robot bắt đầu đi khi bạn bấm.' : 'Đánh dấu đủ 4 xác nhận tại chỗ.')
  const depart = () => {
    next.reset()
    next.mutateAsync({ id: tour.id, requestId: requestId(`depart:${tour.id}:${tour.rowVersion}`), rowVersion: tour.rowVersion, confirmation })
      .then(() => notify({ title: `Đã khởi hành tới ${targets.next ?? 'điểm dừng đầu tiên'}`, detail: 'Theo dõi robot trên camera và bản đồ.' }), () => undefined)
  }
  // Laid out across the situation band: the four ticks in one row on a wide screen, the button and its note under them.
  return <div className="space-y-2.5">
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-semibold text-[#0f172a]">Xác nhận tại chỗ</legend>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{CONFIRMATIONS.map(({ key, label, hint }) => (
        <label key={key} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors duration-150 motion-reduce:transition-none ${confirmation[key] ? 'border-[#bfdbfe] bg-[#eff6ff]' : 'border-[#e2e8f0] hover:border-[#bfdbfe]'}`}>
          <input type="checkbox" checked={confirmation[key]} onChange={event => setConfirmation(value => ({ ...value, [key]: event.target.checked }))} className="mt-0.5 size-4 accent-[#2563eb]" />
          <span className="min-w-0"><span className="block text-[13px] font-semibold text-[#0f172a]">{label}</span><span className="block text-[11.5px] text-muted">{hint}</span></span>
        </label>
      ))}</div>
    </fieldset>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p id="depart-note" className={`text-[13px] leading-5 ${allowed ? 'text-[#64748b]' : 'text-[#7d5310]'}`}>{note}</p>
      <button type="button" className={`${buttonClass('primary', 'lg')} w-full sm:w-auto sm:min-w-[260px]`} disabled={!allowed || next.isPending} onClick={depart} aria-describedby="depart-note">
        <Play size={18} aria-hidden="true" />{next.isPending ? 'Đang gửi…' : `Khởi hành tới ${targets.next ?? 'điểm dừng đầu tiên'}`}
      </button>
    </div>
    {refusal && <div role="alert" className="space-y-2"><p className="text-[13px] font-semibold text-[#9d3428]">{refusal.message}</p>
      {refusal.checks && <BlockerList checks={refusal.checks} blockedBy={refusal.blockedBy} />}</div>}
  </div>
}

/** The Operator's switch for leaving a POI by itself when its dwell ends; off by default and after a server restart. */
export function AutoAdvanceToggle({ detail, disabled }: { detail: TourDetails; disabled: boolean }) {
  const set = useSetAutoAdvance()
  const auto = detail.execution?.autoAdvance
  if (!auto) return null
  const blocked = auto.blockedReason?.split(',').map(id => checkInfo(id)).filter(info => info.group !== 'other').map(info => info.label).join(' · ')
  return <div className="rounded-xl border border-[#e2e8f0] px-3 py-2.5">
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-[#0f172a]">Tự đi tiếp khi hết giờ dừng</span>
        <span className="block text-[11.5px] text-muted">Mặc định tắt. Robot chỉ tự đi khi mọi điều kiện di chuyển đạt; nếu không, nó đứng yên chờ bạn.</span>
      </span>
      <input type="checkbox" role="switch" checked={auto.enabled} disabled={disabled || set.isPending} className="size-5 shrink-0 accent-[#2563eb]"
        onChange={event => set.mutate({ id: detail.tour.id, enabled: event.target.checked },
          { onSuccess: () => notify({ title: event.target.checked ? 'Đã bật tự đi tiếp' : 'Đã tắt tự đi tiếp' }) })} />
    </label>
    {auto.blockedReason && <p className="mt-1.5 text-[12.5px] leading-5 text-[#7d5310]">Lần tự đi tại điểm này không thực hiện được: {blocked || 'robot chưa sẵn sàng'}.</p>}
    {set.isError && <p role="alert" className="mt-1.5 text-[12.5px] font-semibold text-[#9d3428]">{operationRefusal(set.error).message}</p>}
  </div>
}

/**
 * End Early, kept apart from the forward actions and styled as a stop of the
 * Tour, not of the robot: the web page is not an Emergency Stop.
 */
export function EndEarlyAction({ detail, backup = false, disabledNote }: { detail: TourDetails; backup?: boolean; disabledNote?: string | null }) {
  const { tour } = detail
  const end = useEndTourEarly()
  const requestId = useIntentRequestIds()
  return <GatedAction id="end-early" label={backup ? BACKUP_END.button : "Kết thúc sớm Tour"} icon={<CircleStop size={18} aria-hidden="true" />} gate={actionGate(detail, 'endEarly')} variant="danger"
    hint={backup ? BACKUP_END.hint : "Dừng Tour, không dừng khẩn cấp robot."} disabledNote={disabledNote}
    dialog={{ title: backup ? BACKUP_END.button : 'Kết thúc sớm Tour?', confirmLabel: 'Kết thúc sớm', busyLabel: 'Đang kết thúc…',
      description: <div className="space-y-2">
        <p>Tour chuyển sang Đã hủy và không chạy lại được. {endEarlyEffect(detail)}</p>
        {backup && <p>{detail.operatorLastSeenAt
          ? BACKUP_END.confirmation(detail.operator?.fullName ?? '-', formatTime(detail.operatorLastSeenAt))
          : BACKUP_END.legacyConfirmation(detail.operator?.fullName ?? '-')}</p>}
        <p>{BACKUP_END.notice}</p>
        <p className="font-semibold text-[#9d3428]">Đây không phải dừng khẩn cấp. Nếu robot cần dừng ngay, bấm nút dừng khẩn cấp trên robot.</p>
      </div>,
      reason: { label: BACKUP_END.reasonLabel, placeholder: backup ? BACKUP_END.reasonPlaceholder : 'Ví dụ: hành lang tầng 6 bị chặn, không thể tiếp tục.' } }}
    mutation={end}
    submit={reason => end.mutateAsync({ id: tour.id, requestId: requestId(`end:${tour.id}:${tour.rowVersion}:${reason}`), rowVersion: tour.rowVersion, reason })
      .then(() => notify({ title: `Đã kết thúc sớm Tour “${tour.name}”` }))} />
}

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, Lock, ScanLine } from 'lucide-react'
import { HEAD_LOCK_TEXT, headRefusal, useHeadCommand, useHeadMode, useTourHeadStatus, type HeadCommand, type HeadLock } from './head-control'
import { HeadHomeButton } from './HeadHomeButton'

/**
 * One tap, in full motor steps: PAN 0,6° per step (3:1 gearbox) and TILT 0,36° per step (5:1 gearbox since 14/11/2026),
 * so both turn about 9° / 5,4° per tap (`robot/ros2_ws/src/stm32_bridge/HEAD_CONTROL.md`). The backend allows ±20.
 */
const PAN_TAP_STEPS = 15
const TILT_TAP_STEPS = 15
/** A press longer than this turns the head until release; the backend's JOG lives 600 ms, so it is repeated. */
const HOLD_AFTER_MS = 350
const JOG_EVERY_MS = 200

type Direction = { key: string; label: string; icon: ReactNode; step: HeadCommand; jog: { panDir: -1 | 0 | 1; tiltDir: -1 | 0 | 1 } }
// Positive pan is left and positive tilt is up (ADR-0045 addendum).
const UP: Direction = { key: 'up', label: 'Lên', icon: <ArrowUp size={18} aria-hidden="true" />, step: { kind: 'STEP', panSteps: 0, tiltSteps: TILT_TAP_STEPS }, jog: { panDir: 0, tiltDir: 1 } }
const DOWN: Direction = { key: 'down', label: 'Xuống', icon: <ArrowDown size={18} aria-hidden="true" />, step: { kind: 'STEP', panSteps: 0, tiltSteps: -TILT_TAP_STEPS }, jog: { panDir: 0, tiltDir: -1 } }
const LEFT: Direction = { key: 'left', label: 'Trái', icon: <ArrowLeft size={18} aria-hidden="true" />, step: { kind: 'STEP', panSteps: PAN_TAP_STEPS, tiltSteps: 0 }, jog: { panDir: 1, tiltDir: 0 } }
const RIGHT: Direction = { key: 'right', label: 'Phải', icon: <ArrowRight size={18} aria-hidden="true" />, step: { kind: 'STEP', panSteps: -PAN_TAP_STEPS, tiltSteps: 0 }, jog: { panDir: -1, tiltDir: 0 } }

const padButton = 'grid size-12 place-items-center rounded-xl border border-[#cbd5e1] bg-white text-[#0f172a] transition-colors hover:bg-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] disabled:cursor-not-allowed disabled:border-[#e2e8f0] disabled:bg-[#f8fafc] disabled:text-[#a3b1c2] motion-reduce:transition-none'

/** "trái 12°", "phải 30°", "giữa": positive pan is left, positive tilt is up. */
function angleText(value: number | null, positive: string, negative: string) {
  if (value == null || !Number.isFinite(value)) return '-'
  const rounded = Math.round(value)
  return rounded === 0 ? 'giữa' : `${rounded > 0 ? positive : negative} ${Math.abs(rounded)}°`
}

/**
 * Buttons that turn the robot's camera head (ADR-0045). Only the Tour's
 * Operator presses them; anyone else sees them locked with the reason. The
 * server's HEAD_CONTROL_DISABLED and HEAD_ROBOT_NOT_CONNECTED lock them too,
 * until the head status says the control is back. A tap turns one step, a
 * press held down keeps turning until release. No press asks for confirmation:
 * the head never moves the robot.
 */
export function HeadControlPanel({ tourId, isOperator, operatorName }: { tourId: string; isOperator: boolean; operatorName: string | null | undefined }) {
  const status = useTourHeadStatus(tourId, true)
  const command = useHeadCommand(tourId)
  const mode = useHeadMode(tourId)
  // A refusal that locks the buttons, with the status answer it was given against: a newer good status unlocks.
  const [refused, setRefused] = useState<{ lock: HeadLock; seenAt: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // `justHeld`: the pointer click that ends a hold must not also send a step.
  const held = useRef<{ timer?: number; repeat?: number; jogging: boolean; justHeld?: boolean }>({ jogging: false })

  const current = status.data ?? null
  const statusOk = current ? current.enabled && current.connected : false
  const refusedLock = refused && !(statusOk && status.dataUpdatedAt > refused.seenAt) ? refused.lock : null
  const lock: HeadLock | null = !isOperator ? 'notOperator'
    : refusedLock === 'notOperator' || refusedLock === 'notRunning' ? refusedLock
    : current && !current.enabled ? 'disabled'
    : current && !current.connected ? 'notConnected'
    : refusedLock
  const reason = lock === 'notOperator' ? `Chỉ ${operatorName ?? 'người vận hành được giao'} mới xoay được đầu camera.` : lock ? HEAD_LOCK_TEXT[lock] : null
  const locked = lock !== null

  const send = (body: HeadCommand) => {
    command.mutate(body, {
      onSuccess: () => setMessage(null),
      onError: error => {
        const refusal = headRefusal(error)
        setMessage(refusal.lock ? null : refusal.message)
        if (refusal.lock) {
          setRefused({ lock: refusal.lock, seenAt: Date.now() })
          stopHold(false)
        }
      },
    })
  }

  function stopHold(release: boolean) {
    const hold = held.current
    window.clearTimeout(hold.timer)
    window.clearInterval(hold.repeat)
    if (hold.jogging && release) send({ kind: 'JOG', panDir: 0, tiltDir: 0 })
    held.current = { jogging: false, justHeld: hold.jogging }
  }
  // A closed page stops repeating; the robot drops the last JOG by itself after its time to live.
  useEffect(() => () => { window.clearTimeout(held.current.timer); window.clearInterval(held.current.repeat) }, [])

  const press = (direction: Direction) => {
    stopHold(false)
    held.current = { jogging: false }
    held.current.timer = window.setTimeout(() => {
      held.current.jogging = true
      const jog = () => send({ kind: 'JOG', ...direction.jog })
      jog()
      held.current.repeat = window.setInterval(jog, JOG_EVERY_MS)
    }, HOLD_AFTER_MS)
  }
  const release = () => { if (held.current.timer !== undefined || held.current.jogging) stopHold(true) }
  // A click after a hold was the end of that hold; a click alone (or Enter, Space) is one step.
  const click = (direction: Direction, fromPointer: boolean) => {
    const endedHold = held.current.jogging || (fromPointer && Boolean(held.current.justHeld))
    stopHold(true)
    held.current = { jogging: false }
    if (!endedHold) send(direction.step)
  }

  const pad = (direction: Direction) => (
    <button key={direction.key} type="button" className={padButton} disabled={locked} aria-label={`Xoay đầu camera: ${direction.label}`} title={direction.label}
      onPointerDown={event => { if (event.button === 0) press(direction) }} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
      onClick={event => click(direction, event.detail > 0)}>
      {direction.icon}
    </button>
  )

  const auto = current?.mode === 'AUTO'
  const head = current?.head ?? null

  return (
    <div className="space-y-3">
      {reason && <p role="status" className="flex items-start gap-2 rounded-lg bg-[#fffaf0] px-3 py-2 text-[13px] leading-5 font-semibold text-[#7d5310]">
        <Lock size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{reason}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Nút xoay đầu camera">
          <span />{pad(UP)}<span />
          {pad(LEFT)}
          <button type="button" className={padButton} disabled={locked} aria-label="Đưa đầu camera về phía trước" title="Về phía trước"
            onClick={() => send({ kind: 'ANGLE', panDeg: 0, tiltDeg: 0 })}><Crosshair size={18} aria-hidden="true" /></button>
          {pad(RIGHT)}
          <span />{pad(DOWN)}<span />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <button type="button" className={`${padButton} !h-10 !w-full !grid-flow-col gap-2 px-3 text-[13px] font-semibold`} disabled={locked} onClick={() => send({ kind: 'SWEEP' })}>
            <ScanLine size={16} aria-hidden="true" />Quét xung quanh
          </button>
          <label className={`flex items-center justify-between gap-3 rounded-lg border border-[#e2e8f0] px-3 py-2 text-[13px] ${locked ? 'text-muted' : 'text-[#0f172a]'}`}>
            <span className="min-w-0"><span className="block font-semibold">Tự động tại điểm dừng</span>
              <span className="block text-xs text-muted">{current ? (auto ? 'Đang bật' : 'Đang tắt, chỉ xoay bằng nút') : 'Chưa đọc được chế độ'}</span></span>
            <input type="checkbox" role="switch" className="size-4 shrink-0 accent-[#2563eb]" checked={auto} aria-checked={auto}
              disabled={locked || !current || mode.isPending} onChange={event => mode.mutate(event.target.checked ? 'AUTO' : 'MANUAL', {
                onSuccess: () => setMessage(null), onError: error => setMessage(headRefusal(error).message),
              })} />
          </label>
        </div>
      </div>
      <p className="text-xs text-muted">
        {head ? `Đầu camera đang ở: ngang ${angleText(head.panDeg, 'trái', 'phải')}, dọc ${angleText(head.tiltDeg, 'lên', 'xuống')}.`
          : 'Robot chưa báo vị trí đầu camera.'}
        {!locked && ' Bấm một lần để xoay một nấc, giữ nút để xoay liên tục.'}
      </p>
      {message && <p role="alert" className="text-[13px] leading-5 font-semibold text-[#9d3428]">{message}</p>}
      <div className="border-t border-[#f1f5f9] pt-3">
        <HeadHomeButton tourId={tourId} isOperator={isOperator} operatorName={operatorName} compact />
      </div>
    </div>
  )
}

import { ArrowUp, Hand, Info, Minus, MoveHorizontal, Plus, SlidersHorizontal, TriangleAlert, type LucideIcon } from 'lucide-react'
import { HEAD_PAN_LIMIT_DEG, HEAD_SWEEP_LIMITS, HEAD_TILT_LIMIT_DEG, headCameraModeHint, headPresetProblem,
  joinHeadPreset, presetForMode, splitHeadPreset, type HeadCameraMode, type HeadCameraParts } from '../../technical/head-camera-preset'
import { HeadCameraPreview } from './HeadCameraPreview'

const hint = 'text-xs text-[#64748b]'
const focus = 'peer-focus-visible:ring-2 peer-focus-visible:ring-[#5b9dc9] peer-focus-visible:ring-offset-2'
const chip = 'inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-medium tabular-nums transition-colors duration-150 motion-reduce:transition-none'

// Four choices. "Bên trái"/"Bên phải" are angles inside "Góc tùy chỉnh"; a stored LEFT/RIGHT opens there.
const MODES: { mode: HeadCameraMode; icon: LucideIcon; title: string }[] = [
  { mode: 'FRONT', icon: ArrowUp, title: 'Phía trước' },
  { mode: 'SWEEP', icon: MoveHorizontal, title: 'Quét trái, phải' },
  { mode: 'ANGLE', icon: SlidersHorizontal, title: 'Góc tùy chỉnh' },
  { mode: 'NONE', icon: Hand, title: 'Không tự xoay' },
]

type Chip = { label: string; value: number }
// Laid out like the slider above them: PAN left of centre is a turn to the left (positive).
const PAN_CHIPS: Chip[] = [
  { label: 'Trái 90°', value: 90 }, { label: 'Trái 45°', value: 45 }, { label: 'Giữa', value: 0 },
  { label: 'Phải 45°', value: -45 }, { label: 'Phải 90°', value: -90 },
]
const TILT_CHIPS: Chip[] = [
  { label: `Cúi ${HEAD_TILT_LIMIT_DEG}°`, value: -HEAD_TILT_LIMIT_DEG }, { label: 'Cúi 10°', value: -10 }, { label: 'Ngang', value: 0 },
  { label: 'Ngửa 10°', value: 10 }, { label: `Ngửa ${HEAD_TILT_LIMIT_DEG}°`, value: HEAD_TILT_LIMIT_DEG },
]
const SWEEP_CHIPS: Chip[] = [45, 90, 135, HEAD_SWEEP_LIMITS.max].map(value => ({ label: `${value}°`, value }))

/** LEFT/RIGHT are edited as the custom angle they mean, so typing a number turns them into ANGLE. */
function editable(parts: HeadCameraParts): HeadCameraParts {
  if (parts.mode === 'LEFT') return { mode: 'ANGLE', sweepDeg: '', panDeg: '90', tiltDeg: '0' }
  if (parts.mode === 'RIGHT') return { mode: 'ANGLE', sweepDeg: '', panDeg: '-90', tiltDeg: '0' }
  return parts
}

const sideWord = (text: string, positive: string, negative: string, zero: string) => {
  const value = Number(text)
  return !Number.isFinite(value) || text.trim() === '' ? '' : value > 0 ? positive : value < 0 ? negative : zero
}

/** Within the limits and rounded to the step the server stores (one decimal for angles, whole degrees for a sweep). */
const fit = (value: number, min: number, max: number, step: number) => {
  const rounded = Math.round(Math.min(max, Math.max(min, value)) / step) * step
  return String(Number(rounded.toFixed(1)) + 0)
}

type DegreeControlProps = {
  label: string
  side?: string
  text: string
  min: number
  max: number
  step: number
  /** Slider ends, in the order they are drawn (left, right). */
  ends: [string, string]
  /** Draw the slider from max (left) to min (right): PAN turns left as the thumb moves left. */
  reversed?: boolean
  nudge: { less: string; more: string; by: number }
  chips: Chip[]
  onChange: (text: string) => void
}

/**
 * One angle: a number box with nudge buttons, a slider whose ends say which way the head turns, and quick values.
 * Typing keeps the raw text (so "12." survives a render); leaving the box pulls an out-of-range value back to the limit.
 */
function DegreeControl({ label, side, text, min, max, step, ends, reversed, nudge, chips, onChange }: DegreeControlProps) {
  const value = Number(text)
  const valid = text.trim() !== '' && Number.isFinite(value)
  const inRange = valid && value >= min && value <= max
  const current = inRange ? value : 0
  const bump = (delta: number) => onChange(fit(current + delta, min, max, step))
  const nudgeButton = 'grid size-8 shrink-0 place-items-center rounded-lg border border-[#e2e8f0] bg-white text-[#475569] transition-colors duration-150 hover:border-[#a8cde6] hover:text-[#1f557a] disabled:opacity-40 motion-reduce:transition-none'
  return <div className="rounded-xl border border-[#e2e8f0] bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-medium text-[#1e293b]">
        {label}{side && <span className="ml-1.5 font-normal text-[#64748b]">{side}</span>}
        <span className="ml-2 text-xs font-normal text-[#64748b]">giới hạn {min}° đến {max}°</span>
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" className={nudgeButton} aria-label={nudge.less} title={nudge.less}
          disabled={inRange && current - nudge.by < min} onClick={() => bump(-nudge.by)}><Minus size={14} aria-hidden="true" /></button>
        <input className="h-8 w-20 rounded-lg border border-[#e2e8f0] bg-white px-2 text-right text-sm tabular-nums text-[#0f172a] outline-none focus:border-[#2d719e] focus:ring-2 focus:ring-[#5b9dc9]/40 aria-[invalid=true]:border-[#d92d20] aria-[invalid=true]:ring-[#d92d20]/30"
          type="number" inputMode="decimal" min={min} max={max} step={step} value={text}
          aria-label={`${label}${side ? ` ${side}` : ''}`} aria-invalid={!inRange || undefined}
          onChange={e => onChange(e.target.value)}
          onBlur={() => { if (valid && !inRange) onChange(fit(value, min, max, step)) }} />
        <span className="text-sm text-[#64748b]" aria-hidden="true">°</span>
        <button type="button" className={nudgeButton} aria-label={nudge.more} title={nudge.more}
          disabled={inRange && current + nudge.by > max} onClick={() => bump(nudge.by)}><Plus size={14} aria-hidden="true" /></button>
      </div>
    </div>
    <input type="range" aria-label={`Thanh kéo ${label}`} min={min} max={max} step={step} value={current}
      dir={reversed ? 'rtl' : undefined} onChange={e => onChange(e.target.value)} className="mt-3 w-full accent-[#2d719e]" />
    <div className="mt-0.5 flex justify-between text-[11px] text-[#64748b]" aria-hidden="true">
      <span>{ends[0]}</span><span>0°</span><span>{ends[1]}</span>
    </div>
    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Góc nhanh ${label}`}>
      {chips.map(item => {
        const pressed = inRange && current === item.value
        return <button key={item.label} type="button" aria-pressed={pressed} onClick={() => onChange(String(item.value))}
          className={`${chip} ${pressed ? 'border-[#2d719e] bg-[#eff6fb] text-[#1f557a]' : 'border-[#e2e8f0] bg-white text-[#475569] hover:border-[#a8cde6]'}`}>
          {item.label}
        </button>
      })}
    </div>
  </div>
}

/**
 * "Camera & tư liệu": what the VR camera head does when the robot arrives at this POI, in one value (the POI camera
 * preset), with a picture of the motion beside it. The robot applies it by itself when Nav2 reaches the POI and turns
 * back to the front when it drives on (ADR-0045 addendum 14/11/2026). The form refuses to save until
 * `headPresetProblem` is null; the server checks again.
 */
export function HeadCameraPresetField({ value, onChange }: { value: string; onChange: (preset: string) => void }) {
  const stored = splitHeadPreset(value)
  const parts = stored && editable(stored)
  const problem = stored ? headPresetProblem(value) : null
  const change = (patch: Partial<HeadCameraParts>) => parts && onChange(joinHeadPreset({ ...parts, ...patch }))
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div className="min-w-0 space-y-3">
      <fieldset>
        <legend id="poi-camera-legend" className="sr-only">Hoạt động đầu camera VR khi robot tới điểm</legend>
        <p className="text-sm font-medium text-[#1e293b]" aria-hidden="true">Khi robot tới điểm</p>
        {!stored && <p className="mt-2 flex items-start gap-2 rounded-xl border border-[#f1dcb0] bg-[#fffaf0] px-3 py-2 text-[13px] text-[#7d5310]">
          <TriangleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />Hướng cũ {value}, cần chọn lại.</p>}
        <div role="radiogroup" aria-labelledby="poi-camera-legend" className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-1 sm:grid-cols-4">
          {MODES.map(({ mode, icon: Icon, title }) => {
            const checked = parts?.mode === mode
            return <label key={mode} className="relative block cursor-pointer">
              <input type="radio" name="poi-camera" value={mode} checked={checked} onChange={() => onChange(presetForMode(mode))} className="peer sr-only" />
              <span className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-2 py-2 text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-150 motion-reduce:transition-none ${focus} ${checked
                ? 'bg-white text-[#1f557a] shadow-[0_0_0_1px_#2d719e]'
                : 'text-[#475569] hover:bg-white/70'}`}>
                <Icon size={15} aria-hidden="true" className="shrink-0" />{title}
              </span>
            </label>
          })}
        </div>
        {parts && <p className={`${hint} mt-2`}>{headCameraModeHint[parts.mode]}</p>}
      </fieldset>
      {parts?.mode === 'SWEEP' && <DegreeControl label="Biên độ mỗi bên" text={parts.sweepDeg}
        min={HEAD_SWEEP_LIMITS.min} max={HEAD_SWEEP_LIMITS.max} step={1} ends={[`${HEAD_SWEEP_LIMITS.min}°`, `${HEAD_SWEEP_LIMITS.max}°`]}
        nudge={{ less: 'Giảm biên độ 5°', more: 'Tăng biên độ 5°', by: 5 }} chips={SWEEP_CHIPS}
        onChange={sweepDeg => change({ sweepDeg })} />}
      {parts?.mode === 'ANGLE' && <div className="grid gap-2">
        <DegreeControl label="PAN" side={sideWord(parts.panDeg, 'trái', 'phải', 'giữa')} text={parts.panDeg}
          min={-HEAD_PAN_LIMIT_DEG} max={HEAD_PAN_LIMIT_DEG} step={0.1} reversed
          ends={[`Trái ${HEAD_PAN_LIMIT_DEG}°`, `Phải ${HEAD_PAN_LIMIT_DEG}°`]}
          nudge={{ less: 'Quay phải 1°', more: 'Quay trái 1°', by: 1 }} chips={PAN_CHIPS}
          onChange={panDeg => change({ panDeg })} />
        <DegreeControl label="TILT" side={sideWord(parts.tiltDeg, 'ngửa', 'cúi', 'ngang')} text={parts.tiltDeg}
          min={-HEAD_TILT_LIMIT_DEG} max={HEAD_TILT_LIMIT_DEG} step={0.1}
          ends={[`Cúi ${HEAD_TILT_LIMIT_DEG}°`, `Ngửa ${HEAD_TILT_LIMIT_DEG}°`]}
          nudge={{ less: 'Cúi 1°', more: 'Ngửa 1°', by: 1 }} chips={TILT_CHIPS}
          onChange={tiltDeg => change({ tiltDeg })} />
      </div>}
      {problem && <p className="text-xs font-medium text-[#b42318]" role="alert">{problem}</p>}
      <p className="flex items-start gap-2 rounded-xl bg-[#f8fafc] px-3 py-2 text-xs text-[#475569]">
        <Info size={14} aria-hidden="true" className="mt-px shrink-0 text-[#64748b]" />
        <span>Robot tự quay đầu khi tới đúng điểm này (trong khoảng 0,6 m). Khi robot đi tiếp, đầu tự quay về phía trước.</span>
      </p>
    </div>
    {parts ? <HeadCameraPreview key={value} parts={parts} />
      : <p className="grid place-items-center rounded-2xl border border-dashed border-[#e2e8f0] p-6 text-center text-xs text-[#64748b]">Chọn lại hoạt động để xem mô phỏng.</p>}
  </div>
}

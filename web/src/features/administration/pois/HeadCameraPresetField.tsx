import { ArrowLeft, ArrowRight, ArrowUp, Hand, MoveHorizontal, SlidersHorizontal, TriangleAlert, type LucideIcon } from 'lucide-react'
import { HEAD_PAN_LIMIT_DEG, HEAD_SWEEP_LIMITS, HEAD_TILT_LIMIT_DEG, headCameraModeHint, headPresetProblem,
  joinHeadPreset, presetForMode, splitHeadPreset, type HeadCameraMode, type HeadCameraParts } from '../../technical/head-camera-preset'
import { inputClass } from '../../../components/ui/ui-classes'
import { HeadCameraPreview } from './HeadCameraPreview'

const hint = 'text-xs text-[#718096]'
const focus = 'peer-focus-visible:ring-2 peer-focus-visible:ring-[#5b9dc9] peer-focus-visible:ring-offset-2'

// Four choices. "Bên trái"/"Bên phải" are quick buttons inside "Góc tùy chỉnh"; a stored LEFT/RIGHT shows there.
const MODES: { mode: HeadCameraMode; icon: LucideIcon; title: string }[] = [
  { mode: 'FRONT', icon: ArrowUp, title: 'Phía trước' },
  { mode: 'SWEEP', icon: MoveHorizontal, title: 'Quét trái, phải' },
  { mode: 'ANGLE', icon: SlidersHorizontal, title: 'Góc tùy chỉnh' },
  { mode: 'NONE', icon: Hand, title: 'Không tự xoay' },
]

const QUICK_ANGLES = [
  { label: 'Trái 90°', icon: ArrowLeft, preset: 'ANGLE:90,0' },
  { label: 'Phải 90°', icon: ArrowRight, preset: 'ANGLE:-90,0' },
]

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

/** A number box and its slider, both bound to the same typed text so "12." survives a render. */
function DegreeControl({ label, side, text, min, max, step, onChange }: {
  label: string; side?: string; text: string; min: number; max: number; step: number; onChange: (text: string) => void
}) {
  const value = Number(text)
  const inRange = Number.isFinite(value) && value >= min && value <= max
  return <div className="rounded-xl border border-[#e2e8f0] bg-white p-3">
    <label className="flex items-center justify-between gap-3 text-sm font-medium text-[#2d3748]">
      <span className="whitespace-nowrap">{label}{side && <span className="ml-1.5 font-normal text-[#718096]">{side}</span>}</span>
      <span className="flex items-center gap-1.5">
        <input className={`${inputClass} !min-h-8 w-24 shrink-0 px-2 py-1 text-right tabular-nums`} type="number" inputMode="decimal" min={min} max={max} step={step}
          value={text} aria-invalid={!inRange || undefined} onChange={e => onChange(e.target.value)} />
        <span className="text-[#718096]">°</span>
      </span>
    </label>
    <input type="range" aria-label={`Thanh kéo ${label}`} min={min} max={max} step={step} value={inRange ? value : 0}
      onChange={e => onChange(e.target.value)} className="mt-2.5 w-full accent-[#2d719e]" />
  </div>
}

/**
 * "Camera & tư liệu": what the VR camera head does when the robot arrives at this POI, in one value (the POI camera
 * preset), with a 3D picture of the motion beside it. The form refuses to save until `headPresetProblem` is null; the
 * server checks again.
 */
export function HeadCameraPresetField({ value, onChange }: { value: string; onChange: (preset: string) => void }) {
  const stored = splitHeadPreset(value)
  const parts = stored && editable(stored)
  const problem = stored ? headPresetProblem(value) : null
  const change = (patch: Partial<HeadCameraParts>) => parts && onChange(joinHeadPreset({ ...parts, ...patch }))
  const quick = parts?.mode === 'ANGLE' ? `ANGLE:${Number(parts.panDeg)},${Number(parts.tiltDeg)}` : null
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div className="min-w-0 space-y-3">
      <fieldset>
        <legend id="poi-camera-legend" className="sr-only">Hoạt động đầu camera VR khi robot tới điểm</legend>
        <p className="text-sm font-medium text-[#2d3748]" aria-hidden="true">Khi robot tới điểm</p>
        {!stored && <p className="mt-2 flex items-start gap-2 rounded-xl border border-[#f1dcb0] bg-[#fffaf0] px-3 py-2 text-[13px] text-[#7d5310]">
          <TriangleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />Hướng cũ {value}, cần chọn lại.</p>}
        <div role="radiogroup" aria-labelledby="poi-camera-legend" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODES.map(({ mode, icon: Icon, title }) => {
            const checked = parts?.mode === mode
            return <label key={mode} className="relative block cursor-pointer">
              <input type="radio" name="poi-camera" value={mode} checked={checked} onChange={() => onChange(presetForMode(mode))} className="peer sr-only" />
              <span className={`flex h-full flex-col items-start gap-1.5 rounded-xl border px-3 py-2.5 transition-[border-color,background-color,box-shadow] duration-150 motion-reduce:transition-none ${focus} ${checked
                ? 'border-[#2d719e] bg-[#eff6fb] shadow-[0_0_0_1px_#2d719e]'
                : 'border-[#e2e8f0] bg-white hover:border-[#a8cde6] hover:bg-[#f8fbfe]'}`}>
                <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${checked ? 'bg-[#2d719e] text-white' : 'bg-[#f1f5f9] text-[#475569]'}`}><Icon size={15} aria-hidden="true" /></span>
                <span className="text-[13px] font-semibold leading-tight text-[#2d3748]">{title}</span>
              </span>
            </label>
          })}
        </div>
        {parts && <p className={`${hint} mt-2`}>{headCameraModeHint[parts.mode]}</p>}
      </fieldset>
      {parts?.mode === 'SWEEP' && <DegreeControl label="Biên độ mỗi bên" text={parts.sweepDeg}
        min={HEAD_SWEEP_LIMITS.min} max={HEAD_SWEEP_LIMITS.max} step={1} onChange={sweepDeg => change({ sweepDeg })} />}
      {parts?.mode === 'ANGLE' && <>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Góc nhanh">
          {QUICK_ANGLES.map(({ label, icon: Icon, preset }) =>
            <button key={preset} type="button" aria-pressed={quick === preset} onClick={() => onChange(preset)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors duration-150 motion-reduce:transition-none ${quick === preset
                ? 'border-[#2d719e] bg-[#eff6fb] text-[#1f557a]' : 'border-[#e2e8f0] bg-white text-[#475569] hover:border-[#a8cde6]'}`}>
              <Icon size={14} aria-hidden="true" />{label}
            </button>)}
        </div>
        <div className="grid gap-2">
          <DegreeControl label="PAN" side={sideWord(parts.panDeg, 'trái', 'phải', 'giữa')} text={parts.panDeg}
            min={-HEAD_PAN_LIMIT_DEG} max={HEAD_PAN_LIMIT_DEG} step={0.1} onChange={panDeg => change({ panDeg })} />
          <DegreeControl label="TILT" side={sideWord(parts.tiltDeg, 'ngửa', 'cúi', 'ngang')} text={parts.tiltDeg}
            min={-HEAD_TILT_LIMIT_DEG} max={HEAD_TILT_LIMIT_DEG} step={0.1} onChange={tiltDeg => change({ tiltDeg })} />
        </div>
      </>}
      {problem && <p className="text-xs font-medium text-[#b42318]">{problem}</p>}
      <p className={hint}>Rời điểm: đầu tự quay về phía trước.</p>
    </div>
    {parts ? <HeadCameraPreview key={value} parts={parts} />
      : <p className="grid place-items-center rounded-2xl border border-dashed border-[#e2e8f0] p-6 text-center text-xs text-[#718096]">Chọn lại hoạt động để xem mô phỏng.</p>}
  </div>
}

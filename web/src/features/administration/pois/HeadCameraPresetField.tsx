import { ArrowLeft, ArrowRight, ArrowUp, Hand, MoveHorizontal, SlidersHorizontal, TriangleAlert, type LucideIcon } from 'lucide-react'
import { HEAD_PAN_LIMIT_DEG, HEAD_SWEEP_LIMITS, HEAD_TILT_LIMIT_DEG, headCameraModeHint, headPresetProblem,
  joinHeadPreset, presetForMode, splitHeadPreset, type HeadCameraMode, type HeadCameraParts } from '../../technical/head-camera-preset'
import { inputClass } from '../../../components/ui/ui-classes'
import { HeadCameraPreview } from './HeadCameraPreview'

const hint = 'text-xs text-[#718096]'
const focus = 'peer-focus-visible:ring-2 peer-focus-visible:ring-[#5b9dc9] peer-focus-visible:ring-offset-2'

// Short card titles; lists and checks print the full `headCameraModeLabel`.
const MODES: { mode: HeadCameraMode; icon: LucideIcon; title: string; short: string }[] = [
  { mode: 'FRONT', icon: ArrowUp, title: 'Phía trước', short: 'Quay về 0°' },
  { mode: 'LEFT', icon: ArrowLeft, title: 'Bên trái', short: 'Quay 90° sang trái' },
  { mode: 'RIGHT', icon: ArrowRight, title: 'Bên phải', short: 'Quay 90° sang phải' },
  { mode: 'SWEEP', icon: MoveHorizontal, title: 'Quét trái, phải', short: 'Rồi về chỗ cũ' },
  { mode: 'ANGLE', icon: SlidersHorizontal, title: 'Góc tùy chỉnh', short: 'Tự nhập PAN, TILT' },
  { mode: 'NONE', icon: Hand, title: 'Không tự xoay', short: 'Chỉ điều khiển tay' },
]

/** A number box and its slider, both bound to the same typed text so "12." survives a render. */
function DegreeControl({ label, help, text, min, max, step, onChange }: {
  label: string; help: string; text: string; min: number; max: number; step: number; onChange: (text: string) => void
}) {
  const value = Number(text)
  const inRange = Number.isFinite(value) && value >= min && value <= max
  return <div className="rounded-xl border border-[#e2e8f0] bg-white p-3">
    <label className="flex items-center justify-between gap-3 text-sm font-medium text-[#2d3748]">{label}
      <span className="flex items-center gap-1.5">
        <input className={`${inputClass} !min-h-8 w-20 px-2 py-1 text-right tabular-nums`} type="number" inputMode="decimal" min={min} max={max} step={step}
          value={text} aria-invalid={!inRange || undefined} onChange={e => onChange(e.target.value)} />
        <span className="text-[#718096]">°</span>
      </span>
    </label>
    <input type="range" aria-label={`Thanh kéo ${label}`} min={min} max={max} step={step} value={inRange ? value : 0}
      onChange={e => onChange(e.target.value)} className="mt-2.5 w-full accent-[#2d719e]" />
    <div className="flex justify-between text-[11px] tabular-nums text-[#94a3b8]"><span>{min}°</span><span>{help}</span><span>{max}°</span></div>
  </div>
}

/**
 * "Camera & tư liệu": everything the VR camera head does at this POI, in one value (the POI camera preset), with a
 * picture of the motion beside it. The form refuses to save until `headPresetProblem` is null; the server checks again.
 */
export function HeadCameraPresetField({ value, onChange }: { value: string; onChange: (preset: string) => void }) {
  const parts = splitHeadPreset(value)
  const problem = parts ? headPresetProblem(value) : null
  const change = (patch: Partial<HeadCameraParts>) => parts && onChange(joinHeadPreset({ ...parts, ...patch }))
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div className="min-w-0 space-y-3">
      <fieldset>
        <legend id="poi-camera-legend" className="text-sm font-medium text-[#2d3748]">Hoạt động đầu camera VR khi robot tới điểm</legend>
        {!parts && <p className="mt-2 flex items-start gap-2 rounded-xl border border-[#f1dcb0] bg-[#fffaf0] px-3 py-2 text-[13px] text-[#7d5310]">
          <TriangleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />Hướng cũ {value}, cần chọn lại.</p>}
        <div role="radiogroup" aria-labelledby="poi-camera-legend" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MODES.map(({ mode, icon: Icon, title, short }) => {
            const checked = parts?.mode === mode
            return <label key={mode} className="relative block cursor-pointer">
              <input type="radio" name="poi-camera" value={mode} checked={checked} onChange={() => onChange(presetForMode(mode))} className="peer sr-only" />
              <span className={`flex h-full flex-col gap-1.5 rounded-xl border px-3 py-2.5 transition-[border-color,background-color,box-shadow] duration-150 motion-reduce:transition-none ${focus} ${checked
                ? 'border-[#2d719e] bg-[#eff6fb] shadow-[0_0_0_1px_#2d719e]'
                : 'border-[#e2e8f0] bg-white hover:border-[#a8cde6] hover:bg-[#f8fbfe]'}`}>
                <span className={`grid size-7 place-items-center rounded-lg ${checked ? 'bg-[#2d719e] text-white' : 'bg-[#f1f5f9] text-[#475569]'}`}><Icon size={15} aria-hidden="true" /></span>
                <span className="text-[13px] font-semibold leading-tight text-[#2d3748]">{title}</span>
                <span className="text-[11px] leading-tight text-[#718096]">{short}</span>
              </span>
            </label>
          })}
        </div>
        {parts && <p className={`${hint} mt-2`}>{headCameraModeHint[parts.mode]}</p>}
      </fieldset>
      {parts?.mode === 'SWEEP' && <DegreeControl label="Biên độ mỗi bên" help="gần giới hạn robot tự thu nhỏ" text={parts.sweepDeg}
        min={HEAD_SWEEP_LIMITS.min} max={HEAD_SWEEP_LIMITS.max} step={1} onChange={sweepDeg => change({ sweepDeg })} />}
      {parts?.mode === 'ANGLE' && <div className="grid gap-2 sm:grid-cols-2">
        <DegreeControl label="PAN" help="dương là trái" text={parts.panDeg} min={-HEAD_PAN_LIMIT_DEG} max={HEAD_PAN_LIMIT_DEG} step={0.1} onChange={panDeg => change({ panDeg })} />
        <DegreeControl label="TILT" help="dương là ngửa" text={parts.tiltDeg} min={-HEAD_TILT_LIMIT_DEG} max={HEAD_TILT_LIMIT_DEG} step={0.1} onChange={tiltDeg => change({ tiltDeg })} />
      </div>}
      {problem && <p className="text-xs font-medium text-[#b42318]">{problem}</p>}
      <p className={hint}>Khi robot rời điểm, đầu tự quay về phía trước. Nút của người vận hành luôn được ưu tiên, và Tour ở chế độ Bằng tay bỏ qua thiết lập này. Khác với hướng thân robot được đặt trên bản đồ.</p>
    </div>
    {parts ? <HeadCameraPreview key={value} parts={parts} />
      : <p className="grid place-items-center rounded-2xl border border-dashed border-[#e2e8f0] p-6 text-center text-xs text-[#718096]">Chọn lại hoạt động để xem mô phỏng.</p>}
  </div>
}

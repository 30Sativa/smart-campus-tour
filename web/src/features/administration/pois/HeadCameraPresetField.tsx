import { HEAD_PAN_LIMIT_DEG, HEAD_SWEEP_LIMITS, HEAD_TILT_LIMIT_DEG, headCameraModeHint, headCameraModeLabel, headPresetProblem,
  joinHeadPreset, presetForMode, splitHeadPreset, type HeadCameraMode, type HeadCameraParts } from '../../technical/head-camera-preset'
import { inputClass } from '../../../components/ui/ui-classes'

const field = `${inputClass} mt-1.5`
const label = 'flex items-center gap-1 text-sm font-medium text-[#2d3748]'
const hint = 'text-xs text-[#718096]'

/**
 * "Camera & tư liệu": everything the VR camera head does at this POI, in one value (the POI camera preset). The
 * numbers are kept as typed inside the preset string, so a half-typed "12." survives a render; the form refuses to
 * save until `headPresetProblem` is null and the server checks it again.
 */
export function HeadCameraPresetField({ value, onChange }: { value: string; onChange: (preset: string) => void }) {
  const parts = splitHeadPreset(value)
  const problem = parts ? headPresetProblem(value) : null
  const change = (patch: Partial<HeadCameraParts>) => parts && onChange(joinHeadPreset({ ...parts, ...patch }))
  return <div className="space-y-2">
    <div>
      <label htmlFor="poi-camera" className={label}>Hoạt động đầu camera VR khi robot tới điểm</label>
      <select id="poi-camera" title="" className={field} value={parts ? parts.mode : value} onChange={e => onChange(presetForMode(e.target.value as HeadCameraMode))}>
        {!parts && <option value={value} disabled>Hướng cũ {value}, cần chọn lại</option>}
        {(Object.keys(headCameraModeLabel) as HeadCameraMode[]).map(mode => <option key={mode} value={mode}>{headCameraModeLabel[mode]}</option>)}
      </select>
      {parts && <p className={`${hint} mt-1.5`}>{headCameraModeHint[parts.mode]}</p>}
    </div>
    {parts?.mode === 'SWEEP' && <label className="block text-sm text-[#2d3748]">Biên độ mỗi bên (độ)
      <input className={field} type="number" inputMode="numeric" min={HEAD_SWEEP_LIMITS.min} max={HEAD_SWEEP_LIMITS.max} step={1}
        value={parts.sweepDeg} onChange={e => change({ sweepDeg: e.target.value })} />
      <span className={hint}>Từ {HEAD_SWEEP_LIMITS.min} đến {HEAD_SWEEP_LIMITS.max} độ. Gần giới hạn, robot tự thu nhỏ bên đó để không chạm chặn.</span>
    </label>}
    {parts?.mode === 'ANGLE' && <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm text-[#2d3748]">PAN (độ)
        <input className={field} type="number" inputMode="decimal" min={-HEAD_PAN_LIMIT_DEG} max={HEAD_PAN_LIMIT_DEG} step={0.1}
          value={parts.panDeg} onChange={e => change({ panDeg: e.target.value })} />
        <span className={hint}>Dương là sang trái, âm là sang phải, tối đa {HEAD_PAN_LIMIT_DEG}°.</span>
      </label>
      <label className="block text-sm text-[#2d3748]">TILT (độ)
        <input className={field} type="number" inputMode="decimal" min={-HEAD_TILT_LIMIT_DEG} max={HEAD_TILT_LIMIT_DEG} step={0.1}
          value={parts.tiltDeg} onChange={e => change({ tiltDeg: e.target.value })} />
        <span className={hint}>Dương là ngửa lên, âm là cúi xuống, tối đa {HEAD_TILT_LIMIT_DEG}°.</span>
      </label>
    </div>}
    {problem && <p className="text-xs font-medium text-[#b42318]">{problem}</p>}
    <p className={hint}>Khi robot rời điểm, đầu tự quay về phía trước. Nút của người vận hành luôn được ưu tiên, và Tour ở chế độ Bằng tay bỏ qua thiết lập này. Khác với hướng thân robot được đặt trên bản đồ.</p>
  </div>
}

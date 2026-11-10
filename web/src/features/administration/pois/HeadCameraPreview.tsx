import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { buttonClass } from '../../../components/ui/ui-classes'
import { HEAD_PAN_LIMIT_DEG, HEAD_TILT_LIMIT_DEG, type HeadCameraParts } from '../../technical/head-camera-preset'
import { headPlan, poseAt, type Pose } from './head-motion'

/**
 * A picture of what the head will do at the POI: PAN seen from above (front up, left is positive like the robot),
 * TILT seen from the side. "Chạy thử" plays the motion at three times the robot's speed (button speed 30°/s for a
 * sweep, 60°/s to an angle); it is a drawing of the plan, not the robot's live state.
 */

const SPEED_UP = 3
/** The mechanical stop of the PAN axis (robot firmware HOME offset): 174° to the right. */
const STOP_DEG = -174

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

// ---- drawing -------------------------------------------------------------------------------------------------------

const CX = 120, CY = 122
/** PAN θ (positive left) seen from above with the robot's front up. */
const polar = (r: number, deg: number, cx = CX, cy = CY) => {
  const a = deg * Math.PI / 180
  return [cx - r * Math.sin(a), cy - r * Math.cos(a)] as const
}
const arc = (r: number, from: number, to: number) => {
  const points: string[] = []
  const step = from < to ? 2 : -2
  for (let deg = from; step > 0 ? deg < to : deg > to; deg += step) points.push(polar(r, deg).join(','))
  points.push(polar(r, to).join(','))
  return points.join(' ')
}
const wedge = (r: number, center: number, half: number) =>
  `M${CX},${CY} L${polar(r, center + half).join(',')} A${r},${r} 0 0 1 ${polar(r, center - half).join(',')} Z`

const sideLabel = (deg: number, positive: string, negative: string) =>
  Math.round(deg) === 0 ? '0°' : `${Math.abs(Math.round(deg))}° ${deg > 0 ? positive : negative}`

export function HeadCameraPreview({ parts }: { parts: HeadCameraParts }) {
  const plan = headPlan(parts)
  const [playing, setPlaying] = useState<Pose | null>(null)
  const frame = useRef<number | null>(null)
  const stop = () => { if (frame.current != null) cancelAnimationFrame(frame.current); frame.current = null; setPlaying(null) }
  // The field remounts this preview (key) on every new choice, so a run of an older plan never shows.
  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current) }, [])

  const play = () => {
    if (playing) return stop()
    if (reducedMotion() || plan.legs.length === 0) return
    let started: number | null = null
    const tick = (now: number) => {
      started ??= now
      const pose = poseAt(plan.legs, (now - started) / 1000 * SPEED_UP)
      if (!pose) { frame.current = null; setPlaying(null); return }
      setPlaying(pose)
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }

  const pose = playing ?? plan.target
  const totalSeconds = plan.legs.reduce((sum, leg) => sum + leg.seconds, 0)
  const still = parts.mode === 'NONE'
  const [hx, hy] = polar(26, pose.pan)
  const tiltRad = pose.tilt * Math.PI / 180

  return <figure className="rounded-2xl border border-[#e2e8f0] bg-gradient-to-b from-[#f8fbfe] to-white p-3.5" aria-label="Mô phỏng đầu camera">
    <div className="flex items-center justify-between gap-2">
      <figcaption className="text-[13px] font-semibold text-[#2d3748]">Mô phỏng</figcaption>
      {!still && <button type="button" onClick={play} className={buttonClass('ghost', 'sm')} aria-pressed={Boolean(playing)}>
        {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}{playing ? 'Dừng' : 'Chạy thử'}
      </button>}
    </div>

    <svg viewBox="0 0 240 236" className="mt-1 w-full" role="img" aria-label={`Nhìn từ trên: PAN ${sideLabel(pose.pan, 'trái', 'phải')}`}>
      <defs>
        <radialGradient id="head-fov" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#5b9dc9" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#5b9dc9" stopOpacity="0.05" />
        </radialGradient>
      </defs>
      {/* Reach of the PAN axis: soft limits ±170°, the stop 174° to the right. */}
      <circle cx={CX} cy={CY} r={88} fill="none" stroke="#e2e8f0" strokeWidth={1} />
      <polyline points={arc(88, -HEAD_PAN_LIMIT_DEG, HEAD_PAN_LIMIT_DEG)} fill="none" stroke="#cbd5e1" strokeWidth={2} strokeLinecap="round" />
      {plan.sweepDeg != null && <polyline points={arc(88, -plan.sweepDeg, plan.sweepDeg)} fill="none" stroke="#2d719e" strokeWidth={3.5} strokeLinecap="round" strokeDasharray="1 7" />}
      {(() => { const [x, y] = polar(88, STOP_DEG); return <g><rect x={x - 5} y={y - 5} width={10} height={10} rx={2} fill="#f59e0b" transform={`rotate(${-STOP_DEG} ${x} ${y})`} /><text x={x + 9} y={y + 13} fontSize={9} fill="#b45309">Chặn</text></g> })()}
      <text x={CX} y={24} textAnchor="middle" fontSize={10} fill="#64748b">Trước</text>
      <text x={4} y={CY + 3} textAnchor="start" fontSize={10} fill="#64748b">Trái</text>
      <text x={236} y={CY + 3} textAnchor="end" fontSize={10} fill="#64748b">Phải</text>
      {/* Field of view of the Quest camera. */}
      {!still && <path d={wedge(80, pose.pan, 28)} fill="url(#head-fov)" />}
      {/* Robot body, front up. */}
      <rect x={CX - 34} y={CY - 30} width={68} height={84} rx={18} fill="#ffffff" stroke="#94a3b8" strokeWidth={1.5} />
      <path d={`M${CX - 8},${CY - 22} L${CX},${CY - 30} L${CX + 8},${CY - 22}`} fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeLinecap="round" />
      {/* Head and camera. */}
      <circle cx={CX} cy={CY} r={18} fill="#2d3748" />
      <line x1={CX} y1={CY} x2={hx} y2={hy} stroke="#2d3748" strokeWidth={9} strokeLinecap="round" />
      <circle cx={hx} cy={hy} r={4} fill="#93c5fd" />
    </svg>

    <svg viewBox="0 0 240 92" className="mt-1 w-full" role="img" aria-label={`Nhìn ngang: TILT ${sideLabel(pose.tilt, 'ngửa', 'cúi')}`}>
      <path d={`M70,46 L${70 + 150 * Math.cos(HEAD_TILT_LIMIT_DEG * Math.PI / 180)},${46 - 150 * Math.sin(HEAD_TILT_LIMIT_DEG * Math.PI / 180)} L${70 + 150 * Math.cos(HEAD_TILT_LIMIT_DEG * Math.PI / 180)},${46 + 150 * Math.sin(HEAD_TILT_LIMIT_DEG * Math.PI / 180)} Z`} fill="#f1f5f9" />
      {!still && <path d={`M70,46 L${70 + 140 * Math.cos(tiltRad + 0.26)},${46 - 140 * Math.sin(tiltRad + 0.26)} L${70 + 140 * Math.cos(tiltRad - 0.26)},${46 - 140 * Math.sin(tiltRad - 0.26)} Z`} fill="#5b9dc9" fillOpacity={0.22} />}
      <rect x={52} y={52} width={20} height={36} rx={6} fill="#e2e8f0" />
      <circle cx={62} cy={46} r={15} fill="#2d3748" />
      <line x1={62} y1={46} x2={62 + 24 * Math.cos(tiltRad)} y2={46 - 24 * Math.sin(tiltRad)} stroke="#2d3748" strokeWidth={9} strokeLinecap="round" />
      <text x={228} y={14} textAnchor="end" fontSize={10} fill="#64748b">Ngửa</text>
      <text x={228} y={86} textAnchor="end" fontSize={10} fill="#64748b">Cúi</text>
    </svg>

    <dl className="mt-2 grid grid-cols-3 gap-1.5 text-center">
      {[['PAN', sideLabel(pose.pan, 'trái', 'phải')], ['TILT', sideLabel(pose.tilt, 'ngửa', 'cúi')],
        ['Thời gian', still ? '-' : `${Math.round(totalSeconds)} giây`]].map(([name, value]) =>
        <div key={name} className="rounded-lg bg-[#f1f5f9] px-1.5 py-1.5"><dt className="text-[11px] text-[#64748b]">{name}</dt><dd className="text-[13px] font-semibold tabular-nums text-[#2d3748]">{value}</dd></div>)}
    </dl>
    <p className="mt-2 text-[11px] leading-snug text-[#718096]">
      {still ? 'Đầu đứng yên khi tới điểm; người vận hành tự xoay bằng nút.' : `Chạy thử nhanh gấp ${SPEED_UP} lần robot thật. Vạch xám là tầm quay ±${HEAD_PAN_LIMIT_DEG}°, ô vàng là vật chặn.`}
    </p>
  </figure>
}

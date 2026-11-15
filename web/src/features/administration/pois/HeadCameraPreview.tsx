import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { buttonClass } from '../../../components/ui/ui-classes'
import { HEAD_PAN_LIMIT_DEG, HEAD_TILT_LIMIT_DEG, type HeadCameraParts } from '../../technical/head-camera-preset'
import { headPlan, poseAt, type Pose } from './head-motion'
import { ROBOT_SILHOUETTES } from './robot-silhouettes'

/**
 * A picture of what the head will do at the POI, drawn to scale from the real robot (its CAD model, traced into
 * `robot-silhouettes.ts`): PAN seen from above (front up, the robot's left on the left) turns the dome, mount, head and
 * Meta Quest 3 about the column's axis; TILT seen from the robot's right side turns the mount, head and Quest about the
 * pan-tilt shaft, 968,65 mm above the floor. "Chạy thử" plays the motion at three times the robot's speed (30°/s for a
 * sweep, 60°/s to an angle); it is a drawing of the plan, not the robot's live state.
 */

const SPEED_UP = 3
/** Hardware stops (firmware `head_core.h`): PAN 174° to the right, TILT 20° down. */
const PAN_STOP_DEG = -174
const TILT_STOP_DEG = -20
/** On the CAD model, in mm, in each view's coordinates (see `robot-silhouettes.ts`). */
const TOP = { quest: { x: 0, y: -152 }, ring: 215, cone: 380 } as const
const SIDE = { axis: { x: 1.9, y: -968.65 }, quest: { x: 152, y: -1190 }, cone: 380 } as const
/** The Quest's front swings on this circle about the TILT shaft; its reach is drawn just outside it. */
const QUEST_SWING = {
  deg: Math.atan2(SIDE.axis.y - SIDE.quest.y, SIDE.quest.x - SIDE.axis.x) * 180 / Math.PI,
  radius: Math.hypot(SIDE.quest.x - SIDE.axis.x, SIDE.quest.y - SIDE.axis.y) + 40,
}
const VIEW_HALF_DEG = 28

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

// ---- drawing -------------------------------------------------------------------------------------------------------

const RAD = Math.PI / 180
/** A PAN angle (positive = left) seen from above with the front up, around the column at the origin. */
const polar = (r: number, deg: number) => [-r * Math.sin(deg * RAD), -r * Math.cos(deg * RAD)] as const
const arc = (r: number, from: number, to: number) => {
  const points: string[] = []
  const step = from < to ? 2 : -2
  for (let deg = from; step > 0 ? deg < to : deg > to; deg += step) points.push(polar(r, deg).join(','))
  points.push(polar(r, to).join(','))
  return points.join(' ')
}
/** A view wedge from (x, y) toward `deg`, measured in the SVG plane (0 = up for the top view, 0 = right for the side). */
const wedgeFrom = (x: number, y: number, dirX: number, dirY: number, length: number, halfDeg: number) => {
  const turn = (a: number) => [dirX * Math.cos(a) - dirY * Math.sin(a), dirX * Math.sin(a) + dirY * Math.cos(a)] as const
  const [ax, ay] = turn(halfDeg * RAD), [bx, by] = turn(-halfDeg * RAD)
  return `M${x},${y} L${x + ax * length},${y + ay * length} L${x + bx * length},${y + by * length} Z`
}
/** Turn a point by `deg` counter-clockwise on screen around (cx, cy). */
const turnAround = (x: number, y: number, cx: number, cy: number, deg: number) => {
  const a = -deg * RAD, dx = x - cx, dy = y - cy
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)] as const
}

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
  const still = parts.mode === 'NONE'
  const top = ROBOT_SILHOUETTES.top
  const side = ROBOT_SILHOUETTES.side
  const [qx, qy] = turnAround(TOP.quest.x, TOP.quest.y, 0, 0, pose.pan)
  const panDir = [-Math.sin(pose.pan * RAD), -Math.cos(pose.pan * RAD)] as const
  const [sx, sy] = turnAround(SIDE.quest.x, SIDE.quest.y, SIDE.axis.x, SIDE.axis.y, pose.tilt)
  const tiltDir = [Math.cos(pose.tilt * RAD), -Math.sin(pose.tilt * RAD)] as const
  const tiltPoint = (deg: number, r: number) => [SIDE.axis.x + r * Math.cos(deg * RAD), SIDE.axis.y - r * Math.sin(deg * RAD)] as const
  const tiltArc = (from: number, to: number) => Array.from({ length: Math.abs(to - from) + 1 },
    (_, i) => tiltPoint(QUEST_SWING.deg + from + Math.sign(to - from) * i, QUEST_SWING.radius).join(',')).join(' ')
  const [stopX, stopY] = tiltPoint(QUEST_SWING.deg + TILT_STOP_DEG, QUEST_SWING.radius)
  const label = { fontSize: 36, fill: '#64748b' }

  const views = <>
      <svg viewBox="-560 -640 1120 1100" className="mt-1 w-full" role="img" aria-label={`Nhìn từ trên: PAN ${sideLabel(pose.pan, 'trái', 'phải')}`}>
        <defs>
          <linearGradient id="head-fov" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5b9dc9" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#5b9dc9" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <text x={0} y={-590} textAnchor="middle" {...label}>Trước</text>
        <text x={-548} y={12} textAnchor="start" {...label}>Trái</text>
        <text x={548} y={12} textAnchor="end" {...label}>Phải</text>
        {/* The robot body, to scale (563 × 803 mm), with its front marked. */}
        <path d={top.body} fill="#ffffff" stroke="#94a3b8" strokeWidth={5} strokeLinejoin="round" />
        <path d="M-40,-372 L0,-396 L40,-372" fill="none" stroke="#94a3b8" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        <path d={top.column} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={3} />
        {/* Reach of the PAN axis: soft limits ±170°, the stop 174° to the right. */}
        <polyline points={arc(TOP.ring, -HEAD_PAN_LIMIT_DEG, HEAD_PAN_LIMIT_DEG)} fill="none" stroke="#cbd5e1" strokeWidth={8} strokeLinecap="round" />
        {plan.sweepDeg != null && <polyline points={arc(TOP.ring, -plan.sweepDeg, plan.sweepDeg)} fill="none" stroke="#2d719e" strokeWidth={12} strokeLinecap="round" strokeDasharray="4 26" />}
        {(() => { const [x, y] = polar(TOP.ring, PAN_STOP_DEG); return <g><rect x={x - 16} y={y - 16} width={32} height={32} rx={6} fill="#f59e0b" transform={`rotate(${-PAN_STOP_DEG} ${x} ${y})`} /><text x={x + 28} y={y + 44} fontSize={30} fill="#b45309">Chặn</text></g> })()}
        {/* Where the Quest looks. */}
        {!still && <path d={wedgeFrom(qx, qy, panDir[0], panDir[1], TOP.cone, VIEW_HALF_DEG)} fill="url(#head-fov)" />}
        {/* What PAN turns, about the column's axis. */}
        <g transform={`rotate(${-pose.pan})`}>
          <path d={top.dome} fill="#9ec5e0" />
          <path d={top.head} fill="#f8fafc" stroke="#64748b" strokeWidth={3} />
          <path d={top.quest} fill="#2d3748" />
        </g>
      </svg>

      <svg viewBox="-260 -1330 1040 570" className="mt-1 w-full" role="img" aria-label={`Nhìn ngang: TILT ${sideLabel(pose.tilt, 'ngửa', 'cúi')}`}>
        {/* TILT reach of the Quest's front about the shaft: ±18°, and the stop 20° down. */}
        <polyline points={tiltArc(-HEAD_TILT_LIMIT_DEG, HEAD_TILT_LIMIT_DEG)} fill="none" stroke="#cbd5e1" strokeWidth={8} strokeLinecap="round" />
        <rect x={stopX - 14} y={stopY - 14} width={28} height={28} rx={5} fill="#f59e0b" transform={`rotate(${-(QUEST_SWING.deg + TILT_STOP_DEG)} ${stopX} ${stopY})`} />
        <text x={stopX + 26} y={stopY + 12} fontSize={30} fill="#b45309">Chặn</text>
        {!still && <path d={wedgeFrom(sx, sy, tiltDir[0], tiltDir[1], SIDE.cone, 20)} fill="#5b9dc9" fillOpacity={0.24} />}
        <path d={side.column} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={3} />
        <path d={side.base} fill="#cbd5e1" />
        <path d={side.dome} fill="#9ec5e0" />
        {/* What TILT turns, about the shaft (the dot). */}
        <g transform={`rotate(${-pose.tilt} ${SIDE.axis.x} ${SIDE.axis.y})`}>
          <path d={side.mount} fill="#7fb2d6" />
          <path d={side.head} fill="#f8fafc" stroke="#64748b" strokeWidth={3} />
          <path d={side.quest} fill="#2d3748" />
        </g>
        <circle cx={SIDE.axis.x} cy={SIDE.axis.y} r={9} fill="#ffffff" stroke="#2d3748" strokeWidth={4} />
        <text x={770} y={-1296} textAnchor="end" {...label}>Ngửa</text>
        <text x={770} y={-776} textAnchor="end" {...label}>Cúi</text>
        <text x={770} y={-956} textAnchor="end" {...label}>Trước</text>
        <text x={-250} y={-956} textAnchor="start" {...label}>Sau</text>
      </svg>
  </>

  return <figure className="rounded-2xl border border-[#e2e8f0] bg-gradient-to-b from-[#f8fbfe] to-white p-3.5" aria-label="Mô phỏng đầu camera">
    <div className="flex items-center justify-between gap-2">
      <figcaption className="text-[13px] font-semibold text-[#2d3748]">Mô phỏng</figcaption>
      {!still && <button type="button" onClick={play} className={buttonClass('ghost', 'sm')} aria-pressed={Boolean(playing)} title={`Phát nhanh gấp ${SPEED_UP} lần robot thật`}>
        {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}{playing ? 'Dừng' : 'Chạy thử'}
      </button>}
    </div>

    {views}

    <dl className="mt-2 grid grid-cols-2 gap-1.5 text-center">
      {[['PAN', sideLabel(pose.pan, 'trái', 'phải')], ['TILT', sideLabel(pose.tilt, 'ngửa', 'cúi')]].map(([name, value]) =>
        <div key={name} className="rounded-lg bg-[#f1f5f9] px-1.5 py-1.5"><dt className="text-[11px] text-[#64748b]">{name}</dt><dd className="text-[13px] font-semibold tabular-nums text-[#2d3748]">{value}</dd></div>)}
    </dl>
  </figure>
}

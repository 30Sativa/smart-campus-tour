import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Pause, Play } from 'lucide-react'
import { buttonClass } from '../../../components/ui/ui-classes'
import { HEAD_PAN_LIMIT_DEG, HEAD_TILT_LIMIT_DEG, type HeadCameraParts } from '../../technical/head-camera-preset'
import { headPlan, poseAt, type Pose } from './head-motion'
import { ROBOT_SILHOUETTES } from './robot-silhouettes'

/**
 * A picture of what the head will do at the POI, drawn to scale from the real robot (its CAD model, traced into
 * `robot-silhouettes.ts`): PAN seen from above (front up, the robot's left on the left) turns the dome, head and
 * Meta Quest 3 about the column's axis; TILT seen from the robot's right side turns the mount, head and Quest about the
 * pan-tilt shaft, 968,65 mm above the floor. "Chạy thử" plays the motion at three times the robot's speed (30°/s for a
 * sweep, 60°/s to an angle); it is a drawing of the plan, not the robot's live state.
 */

const SPEED_UP = 3
/** Hardware stops (firmware `head_core.h`): PAN 174° to the right, TILT 20° down. */
const PAN_STOP_DEG = -174
const TILT_STOP_DEG = -20
/** On the CAD model, in mm, in each view's coordinates (see `robot-silhouettes.ts`). */
const TOP = { quest: { x: 0, y: -152 }, ring: 215, cone: 360 } as const
const SIDE = { axis: { x: 1.9, y: -968.65 }, quest: { x: 152, y: -1190 }, cone: 360 } as const
/** The TILT reach: the directions the camera can point (±18°), drawn from the Quest's lenses, this long (mm). */
const TILT_FAN_RADIUS = 400
const VIEW_HALF_DEG = { pan: 28, tilt: 20 }

const INK = { line: '#cbd5e1', muted: '#64748b', body: '#94a3b8', accent: '#2d719e', stop: '#f59e0b', quest: '#1e293b', head: '#475569', moving: '#a9c7de', mount: '#7fa9c9' }
/** Direction words, drawn last with a white halo so a view cone never hides them. */
const LABEL = { fontSize: 30, fill: INK.muted, letterSpacing: 2, fontWeight: 600, stroke: '#ffffff', strokeWidth: 10, paintOrder: 'stroke' } as const

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

// ---- geometry ------------------------------------------------------------------------------------------------------

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
/** A view wedge from (x, y) along the unit direction (dirX, dirY). */
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
/** A point `r` mm from the Quest's lenses (at TILT 0) in direction `deg`, measured up from the front. */
const tiltPoint = (deg: number, r: number) => [SIDE.quest.x + r * Math.cos(deg * RAD), SIDE.quest.y - r * Math.sin(deg * RAD)] as const
const tiltFan = (from: number, to: number, r: number) =>
  `M${SIDE.quest.x},${SIDE.quest.y} ` + Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => `L${tiltPoint(from + Math.sign(to - from) * i, r).join(',')}`).join(' ') + ' Z'
const tiltRay = (deg: number, from: number, to: number) => {
  const [x1, y1] = tiltPoint(deg, from), [x2, y2] = tiltPoint(deg, to)
  return { x1, y1, x2, y2 }
}

const sideLabel = (deg: number, positive: string, negative: string) =>
  Math.round(deg) === 0 ? '0°' : `${Math.abs(Math.round(deg))}° ${deg > 0 ? positive : negative}`

/** Where the Quest looks: a wedge from its lenses, fading with distance. */
function ViewCone({ x, y, dirX, dirY, length, halfDeg }: { x: number; y: number; dirX: number; dirY: number; length: number; halfDeg: number }) {
  const fade = useId()
  return <>
    <defs>
      <linearGradient id={fade} gradientUnits="userSpaceOnUse" x1={x} y1={y} x2={x + dirX * length} y2={y + dirY * length}>
        <stop offset="0%" stopColor={INK.accent} stopOpacity="0.42" />
        <stop offset="100%" stopColor={INK.accent} stopOpacity="0.05" />
      </linearGradient>
    </defs>
    <path d={wedgeFrom(x, y, dirX, dirY, length, halfDeg)} fill={`url(#${fade})`} />
  </>
}

// ---- view frame ----------------------------------------------------------------------------------------------------

/** One view: a titled, bordered drawing on a 5 cm grid with a 10 cm scale bar (the drawing is in millimetres). */
function View({ title, value, viewBox, label, scaleAt, children }: {
  title: string; value: string; viewBox: [number, number, number, number]; label: string; scaleAt: [number, number]; children: ReactNode
}) {
  const grid = useId()
  const [x, y, w, h] = viewBox
  return <div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
    <div className="flex items-center justify-between gap-2 border-b border-[#f1f5f9] px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">{title}</p>
      <p className="rounded-full bg-[#eff6fb] px-2 py-0.5 text-xs font-semibold tabular-nums text-[#1f557a]">{value}</p>
    </div>
    <svg viewBox={viewBox.join(' ')} className="block w-full" role="img" aria-label={label}>
      <defs>
        <pattern id={grid} width={50} height={50} patternUnits="userSpaceOnUse">
          <circle cx={0} cy={0} r={3} fill="#e2e8f0" />
        </pattern>
      </defs>
      <rect x={x} y={y} width={w} height={h} fill={`url(#${grid})`} />
      {children}
      {/* 10 cm, so the drawing reads as a real size. */}
      <g transform={`translate(${scaleAt[0]} ${scaleAt[1]})`} aria-hidden="true">
        <path d="M0,-10 V0 H100 V-10" fill="none" stroke={INK.muted} strokeWidth={4} />
        <text x={116} y={4} fontSize={26} fill={INK.muted}>10 cm</text>
      </g>
    </svg>
  </div>
}

// ---- preview -------------------------------------------------------------------------------------------------------

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
  const [sx, sy] = turnAround(SIDE.quest.x, SIDE.quest.y, SIDE.axis.x, SIDE.axis.y, pose.tilt)
  const [panStopX, panStopY] = polar(TOP.ring, PAN_STOP_DEG)
  const [tiltStopX, tiltStopY] = tiltPoint(TILT_STOP_DEG, TILT_FAN_RADIUS)
  const panText = sideLabel(pose.pan, 'trái', 'phải')
  const tiltText = sideLabel(pose.tilt, 'ngửa', 'cúi')

  return <figure className="@container min-w-0 rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-3" aria-label="Mô phỏng đầu camera">
    <div className="flex items-start justify-between gap-2 px-0.5">
      <figcaption>
        <span className="block text-[13px] font-semibold text-[#0f172a]">Mô phỏng</span>
        <span className="block text-[11px] text-[#64748b]">Đúng tỉ lệ robot thật</span>
      </figcaption>
      {!still && <button type="button" onClick={play} className={buttonClass('secondary', 'sm')} aria-pressed={Boolean(playing)} title={`Phát nhanh gấp ${SPEED_UP} lần robot thật`}>
        {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}{playing ? 'Dừng' : 'Chạy thử'}
      </button>}
    </div>

    <div className="mt-2.5 grid items-start gap-2 @lg:grid-cols-2">
      <View title="Nhìn từ trên · PAN" value={panText} viewBox={[-400, -580, 800, 1040]} label={`Nhìn từ trên: PAN ${panText}`} scaleAt={[-370, 430]}>
        {/* The robot body (563 × 803 mm) with its front marked, and the column. */}
        <path d={top.body} fill="#ffffff" stroke={INK.body} strokeWidth={5} strokeLinejoin="round" />
        <path d="M-36,-374 L0,-394 L36,-374" fill="none" stroke={INK.body} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
        <path d={top.column} fill="#f1f5f9" stroke={INK.line} strokeWidth={3} />
        {/* PAN reach: ±170°, the stop 174° to the right; a sweep as a dotted arc. */}
        <polyline points={arc(TOP.ring, -HEAD_PAN_LIMIT_DEG, HEAD_PAN_LIMIT_DEG)} fill="none" stroke={INK.line} strokeWidth={9} strokeLinecap="round" />
        {plan.sweepDeg != null && <polyline points={arc(TOP.ring, -plan.sweepDeg, plan.sweepDeg)} fill="none" stroke={INK.accent} strokeWidth={13} strokeLinecap="round" strokeDasharray="1 24" />}
        <rect x={panStopX - 15} y={panStopY - 15} width={30} height={30} rx={6} fill={INK.stop} transform={`rotate(${-PAN_STOP_DEG} ${panStopX} ${panStopY})`} />
        {!still && <ViewCone x={qx} y={qy} dirX={-Math.sin(pose.pan * RAD)} dirY={-Math.cos(pose.pan * RAD)} length={TOP.cone} halfDeg={VIEW_HALF_DEG.pan} />}
        {/* What PAN turns, about the column's axis. */}
        <g transform={`rotate(${-pose.pan})`}>
          <path d={top.dome} fill={INK.moving} />
          <path d={top.head} fill="#ffffff" stroke={INK.head} strokeWidth={4} strokeLinejoin="round" />
          <path d={top.quest} fill={INK.quest} />
        </g>
        <circle cx={0} cy={0} r={8} fill="#ffffff" stroke={INK.quest} strokeWidth={4} />
        <text x={0} y={-540} textAnchor="middle" {...LABEL}>TRƯỚC</text>
        <text x={-385} y={10} textAnchor="start" {...LABEL}>TRÁI</text>
        <text x={385} y={10} textAnchor="end" {...LABEL}>PHẢI</text>
      </View>

      <View title="Nhìn ngang · TILT" value={tiltText} viewBox={[-250, -1330, 840, 580]} label={`Nhìn ngang: TILT ${tiltText}`} scaleAt={[-225, -785]}>
        {/* TILT reach: the camera points within ±18° (the fan); the stop is 20° down. The head turns about the
            real shaft (the dot), so the lenses also move a little: the fan is drawn from where they are at 0°. */}
        <path d={tiltFan(-HEAD_TILT_LIMIT_DEG, HEAD_TILT_LIMIT_DEG, TILT_FAN_RADIUS)} fill="#eef2f7" />
        {[HEAD_TILT_LIMIT_DEG, -HEAD_TILT_LIMIT_DEG].map(deg => <line key={deg} {...tiltRay(deg, 40, TILT_FAN_RADIUS)} stroke={INK.line} strokeWidth={5} strokeDasharray="16 12" />)}
        <line {...tiltRay(TILT_STOP_DEG, 40, TILT_FAN_RADIUS)} stroke={INK.stop} strokeWidth={5} strokeDasharray="16 12" />
        <rect x={tiltStopX - 14} y={tiltStopY - 14} width={28} height={28} rx={6} fill={INK.stop} transform={`rotate(${-TILT_STOP_DEG} ${tiltStopX} ${tiltStopY})`} />
        {!still && <ViewCone x={sx} y={sy} dirX={Math.cos(pose.tilt * RAD)} dirY={-Math.sin(pose.tilt * RAD)} length={SIDE.cone} halfDeg={VIEW_HALF_DEG.tilt} />}
        <path d={side.column} fill="#f1f5f9" stroke={INK.line} strokeWidth={3} />
        <path d={side.base} fill="#dbe4ee" />
        <path d={side.dome} fill={INK.moving} />
        {/* What TILT turns, about the shaft (the dot). */}
        <g transform={`rotate(${-pose.tilt} ${SIDE.axis.x} ${SIDE.axis.y})`}>
          <path d={side.mount} fill={INK.mount} />
          <path d={side.head} fill="#ffffff" stroke={INK.head} strokeWidth={4} strokeLinejoin="round" />
          <path d={side.quest} fill={INK.quest} />
        </g>
        <circle cx={SIDE.axis.x} cy={SIDE.axis.y} r={9} fill="#ffffff" stroke={INK.quest} strokeWidth={4} />
        <text x={575} y={-1290} textAnchor="end" {...LABEL}>TRƯỚC</text>
        <text x={-235} y={-1290} textAnchor="start" {...LABEL}>SAU</text>
      </View>
    </div>

    <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 px-0.5 text-[11px] text-[#64748b]" aria-label="Chú thích">
      <li className="flex items-center gap-1.5"><span className="h-1 w-4 rounded-full bg-[#cbd5e1]" aria-hidden="true" />Tầm quay</li>
      <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-[#f59e0b]" aria-hidden="true" />Vật chặn</li>
      <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 bg-gradient-to-r from-[#2d719e]/50 to-[#2d719e]/10 [clip-path:polygon(0_50%,100%_0,100%_100%)]" aria-hidden="true" />Hướng camera nhìn</li>
      <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-[#1e293b] bg-white" aria-hidden="true" />Trục quay</li>
    </ul>
  </figure>
}

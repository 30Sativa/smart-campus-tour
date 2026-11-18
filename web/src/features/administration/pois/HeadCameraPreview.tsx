import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Pause, Play } from 'lucide-react'
import { buttonClass } from '../../../components/ui/ui-classes'
import { HEAD_PAN_LIMIT_DEG, HEAD_TILT_LIMIT_DEG, type HeadCameraParts } from '../../technical/head-camera-preset'
import { headPlan, poseAt, type Pose } from './head-motion'
import { poiThemeClass } from './poi-ui'

/**
 * An illustration of what the head will do at the POI (not to scale): PAN seen from above, the robot's front up and
 * its left on the left, and TILT seen from the side, front to the right. Angles, limits (PAN ±170°, TILT ±18°) and
 * the PAN stop are the real ones. "Chạy thử" plays the motion at three times the robot's speed (30°/s for a sweep,
 * 60°/s to an angle); it is a picture of the plan, not the robot's live state.
 */

const SPEED_UP = 3
/** Hardware stop (firmware `head_core.h`): PAN 174° to the right. */
const PAN_STOP_DEG = -174

const C = { line: 'var(--poi-rule)', body: 'var(--poi-body)', head: 'var(--poi-head)', visor: 'var(--poi-visor)', accent: 'var(--poi-accent)', stop: 'var(--poi-stop)', muted: 'var(--poi-muted)' }
const RAD = Math.PI / 180

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

const sideLabel = (deg: number, positive: string, negative: string) =>
  Math.round(deg) === 0 ? '0°' : `${Math.abs(Math.round(deg))}° ${deg > 0 ? positive : negative}`

/** Point at `r` from (cx, cy) toward `deg`: 0 = up, positive turns counter-clockwise on screen. */
const polar = (cx: number, cy: number, r: number, deg: number) => [cx - r * Math.sin(deg * RAD), cy - r * Math.cos(deg * RAD)] as const

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const [x1, y1] = polar(cx, cy, r, from), [x2, y2] = polar(cx, cy, r, to)
  return `M${x1},${y1} A${r},${r} 0 ${Math.abs(to - from) > 180 ? 1 : 0} ${to > from ? 0 : 1} ${x2},${y2}`
}

/** A fading view wedge from (cx, cy) toward `deg` (same convention as `polar`). */
function Cone({ cx, cy, deg, length, half }: { cx: number; cy: number; deg: number; length: number; half: number }) {
  const id = useId()
  const [ax, ay] = polar(cx, cy, length, deg + half), [bx, by] = polar(cx, cy, length, deg - half)
  const [fx, fy] = polar(cx, cy, length, deg)
  return <>
    <defs>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={cx} y1={cy} x2={fx} y2={fy}>
        <stop offset="0%" stopColor={C.accent} stopOpacity="0.45" />
        <stop offset="100%" stopColor={C.accent} stopOpacity="0" />
      </linearGradient>
    </defs>
    <path d={`M${cx},${cy} L${ax},${ay} L${bx},${by} Z`} fill={`url(#${id})`} />
  </>
}

function Panel({ title, value, label, children }: { title: string; value: string; label: string; children: ReactNode }) {
  return <div className="min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-1">
      <p className="text-xs font-medium text-[var(--poi-muted)]">{title}</p>
      <p className="text-[13px] font-semibold tabular-nums text-[var(--poi-ink)]">{value}</p>
    </div>
    <svg viewBox="0 0 200 170" className="mt-1 block max-h-[150px] w-full" role="img" aria-label={label}>{children}</svg>
  </div>
}

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
  const panText = sideLabel(pose.pan, 'trái', 'phải')
  const tiltText = sideLabel(pose.tilt, 'ngửa', 'cúi')

  // Top view: robot centred, the head on its column.
  const T = { x: 100, y: 92 }
  const [stopX, stopY] = polar(T.x, T.y, 62, PAN_STOP_DEG)
  // Side view: the head turns about the pivot on top of the column; its front is to the right (-90 in `polar`).
  const S = { x: 70, y: 112 }
  const eye = { x: S.x, y: S.y - 30 }
  const [lookX, lookY] = polar(S.x, S.y, 30, pose.tilt) // the head's centre once tilted about the pivot

  return <figure className={`${poiThemeClass} min-w-0 border-t border-[var(--poi-rule)] pt-4`} aria-label="Mô phỏng đầu camera">
    <div className="flex items-center justify-between gap-2">
      <figcaption className="text-[13px] font-semibold text-[var(--poi-ink)]">Mô phỏng</figcaption>
      {!still && <button type="button" onClick={play} className={buttonClass('secondary', 'sm')} aria-pressed={Boolean(playing)} title={`Phát nhanh gấp ${SPEED_UP} lần robot thật`}>
        {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}{playing ? 'Dừng' : 'Chạy thử'}
      </button>}
    </div>

    <div className="mt-3 grid grid-cols-2 gap-3">
      <Panel title="Nhìn từ trên" value={panText} label={`Nhìn từ trên: PAN ${panText}`}>
        <text x={T.x} y={12} textAnchor="middle" fontSize={10} fill={C.muted}>Trước</text>
        {/* PAN reach ±170°; the gap at the back is where the stop is. */}
        <path d={arcPath(T.x, T.y, 62, -HEAD_PAN_LIMIT_DEG, HEAD_PAN_LIMIT_DEG)} fill="none" stroke={C.line} strokeWidth={5} strokeLinecap="round" />
        {plan.sweepDeg != null && <path d={arcPath(T.x, T.y, 62, -plan.sweepDeg, plan.sweepDeg)} fill="none" stroke={C.accent} strokeWidth={5} strokeLinecap="round" strokeOpacity={0.55} />}
        <circle cx={stopX} cy={stopY} r={4} fill={C.stop} />
        <rect x={T.x - 34} y={T.y - 42} width={68} height={84} rx={16} fill="var(--poi-paper)" stroke={C.body} strokeWidth={2} />
        <path d={`M${T.x - 8},${T.y - 34} L${T.x},${T.y - 39} L${T.x + 8},${T.y - 34}`} fill="none" stroke={C.body} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {!still && <Cone cx={T.x} cy={T.y} deg={pose.pan} length={92} half={26} />}
        {/* Head: the dark visor shows where the camera looks. */}
        <g transform={`rotate(${-pose.pan} ${T.x} ${T.y})`}>
          <circle cx={T.x} cy={T.y} r={16} fill="var(--poi-paper)" stroke={C.head} strokeWidth={2} />
          <rect x={T.x - 13} y={T.y - 19} width={26} height={9} rx={4.5} fill={C.visor} />
        </g>
      </Panel>

      <Panel title="Nhìn ngang" value={tiltText} label={`Nhìn ngang: TILT ${tiltText}`}>
        <text x={192} y={12} textAnchor="end" fontSize={10} fill={C.muted}>Trước →</text>
        {/* TILT reach ±18° in front of the face. */}
        <path d={`M${eye.x},${eye.y} L${polar(eye.x, eye.y, 100, -90 - HEAD_TILT_LIMIT_DEG).join(',')} ${arcPath(eye.x, eye.y, 100, -90 - HEAD_TILT_LIMIT_DEG, -90 + HEAD_TILT_LIMIT_DEG).replace(/^M[^A]*/, '')} Z`} fill="var(--poi-ground)" />
        <rect x={S.x - 16} y={S.y + 6} width={32} height={60} rx={6} fill={C.line} />
        <path d={`M${S.x - 22},${S.y + 8} Q${S.x},${S.y - 16} ${S.x + 22},${S.y + 8} Z`} fill={C.body} />
        {!still && <Cone cx={lookX} cy={lookY} deg={-90 + pose.tilt} length={112} half={16} />}
        <g transform={`rotate(${-pose.tilt} ${S.x} ${S.y})`}>
          <rect x={S.x - 4} y={S.y - 14} width={8} height={16} rx={2} fill={C.head} />
          <circle cx={eye.x} cy={eye.y} r={20} fill="var(--poi-paper)" stroke={C.head} strokeWidth={2} />
          <rect x={eye.x + 10} y={eye.y - 9} width={15} height={18} rx={5} fill={C.visor} />
        </g>
        <circle cx={S.x} cy={S.y} r={3} fill="var(--poi-paper)" stroke={C.visor} strokeWidth={1.5} />
      </Panel>
    </div>

    <p className="mt-2 px-0.5 text-[11px] text-[var(--poi-muted)]">
      Hình minh họa. Tầm quay PAN ±{HEAD_PAN_LIMIT_DEG}°, TILT ±{HEAD_TILT_LIMIT_DEG}°, chấm cam là vật chặn.
    </p>
  </figure>
}

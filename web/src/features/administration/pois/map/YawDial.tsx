import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { quantizeYaw } from './occupancy-grid'

type Props = {
  yaw: number | null
  disabled: boolean
  onChange: (yaw: number) => void
}

const PRESETS = [
  { label: '0', value: 0 },
  { label: 'π/4', value: Math.PI / 4 },
  { label: 'π/2', value: Math.PI / 2 },
  { label: 'π', value: Math.PI },
  { label: '−π/2', value: -Math.PI / 2 },
  { label: '−π/4', value: -Math.PI / 4 },
]
const STEP = Math.PI / 180
const KEY_STEPS: Record<string, number | undefined> = { ArrowLeft: STEP, ArrowUp: STEP, ArrowRight: -STEP, ArrowDown: -STEP, PageUp: 15 * STEP, PageDown: -15 * STEP }
const TICKS = Array.from({ length: 24 }, (_, index) => index * 15)

/** Wraps to (−π, π] and keeps the 6-decimal precision the API stores. */
function wrapYaw(yaw: number) {
  let value = yaw
  while (value > Math.PI) value -= 2 * Math.PI
  while (value <= -Math.PI) value += 2 * Math.PI
  return quantizeYaw(value)
}

/**
 * Compass for the POI body heading in the ROS map frame: 0 = +X, positive
 * turns toward +Y (counter-clockwise on screen). Drag snaps to whole degrees.
 */
export function YawDial({ yaw, disabled, onChange }: Props) {
  const dragging = useRef<number | null>(null)
  const degrees = yaw == null ? null : yaw * 180 / Math.PI

  const fromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const angle = Math.atan2(-(event.clientY - (box.top + box.height / 2)), event.clientX - (box.left + box.width / 2))
    onChange(wrapYaw(Math.round(angle / STEP) * STEP))
  }

  const keyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (disabled) return
    const delta = KEY_STEPS[event.key]
    if (delta == null) return
    event.preventDefault()
    onChange(wrapYaw((yaw ?? 0) + delta))
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div className="flex flex-col items-center">
        <svg
          viewBox="0 0 150 150" width={150} height={150}
          role="slider" tabIndex={disabled ? -1 : 0}
          aria-label="Hướng thân robot tại POI" aria-disabled={disabled}
          aria-valuemin={-180} aria-valuemax={180} aria-valuenow={degrees == null ? undefined : Math.round(degrees)}
          aria-valuetext={degrees == null ? 'Chưa chọn' : `${degrees.toFixed(1)} độ`}
          onKeyDown={keyDown}
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) return
            dragging.current = event.pointerId
            event.currentTarget.setPointerCapture?.(event.pointerId)
            fromPointer(event)
          }}
          onPointerMove={(event) => { if (dragging.current === event.pointerId) fromPointer(event) }}
          onPointerUp={() => { dragging.current = null }}
          onPointerCancel={() => { dragging.current = null }}
          className={`touch-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-grab active:cursor-grabbing'}`}
        >
          <circle cx={75} cy={75} r={62} fill="#f8fbff" stroke="#d9e9f5" strokeWidth={2} />
          {TICKS.map((tick) => {
            const angle = tick * Math.PI / 180
            const major = tick % 90 === 0
            const inner = major ? 51 : 56
            return <line key={tick} x1={75 + Math.cos(angle) * inner} y1={75 - Math.sin(angle) * inner} x2={75 + Math.cos(angle) * 60} y2={75 - Math.sin(angle) * 60} stroke={major ? '#a8cde6' : '#d9e9f5'} strokeWidth={major ? 2.5 : 1.5} />
          })}
          <text x={141} y={79} fontSize={10} fill="#86a0b3" textAnchor="end" fontFamily="var(--font-mono, monospace)">+X</text>
          <text x={75} y={13} fontSize={10} fill="#86a0b3" textAnchor="middle" fontFamily="var(--font-mono, monospace)">+Y</text>
          <g transform={`rotate(${degrees == null ? 0 : -degrees} 75 75)`} opacity={degrees == null ? 0.25 : 1} className="transition-transform duration-150">
            <path d="M75 75 L118 59 A46 46 0 0 1 118 91 Z" fill="rgba(37,99,235,0.12)" />
            <line x1={75} y1={75} x2={126} y2={75} stroke="#2563eb" strokeWidth={3} strokeLinecap="round" />
            <circle cx={126} cy={75} r={8.5} fill="#fff" stroke="#2563eb" strokeWidth={3} />
          </g>
          <circle cx={75} cy={75} r={5} fill="#2563eb" />
        </svg>
        <p aria-hidden="true" className="mt-1 font-mono text-[15px] font-semibold text-[#173b59]">{degrees == null ? '—' : `${degrees.toFixed(1)}°`}</p>
        <p aria-hidden="true" className="font-mono text-[10.5px] text-[#86a0b3]">{yaw == null ? 'chưa chọn' : `${yaw.toFixed(4)} rad`}</p>
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        <p className="text-[13px] font-semibold text-[#334155]">Hướng thân robot tại POI</p>
        <p className="text-xs leading-5 text-[#7c94a7]">Kéo núm trên vòng tròn, dùng phím mũi tên, hoặc chọn nhanh. Giá trị được ghi vào ô Yaw (rad) bên dưới.</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chọn nhanh yaw">
          {PRESETS.map((preset) => (
            <button
              key={preset.label} type="button" disabled={disabled}
              aria-pressed={yaw != null && Math.abs(yaw - quantizeYaw(preset.value)) < 1e-6}
              onClick={() => onChange(quantizeYaw(preset.value))}
              className="rounded-lg border border-[#d9e9f5] bg-white px-2.5 py-1 font-mono text-[11.5px] font-semibold text-[#285c7d] transition-colors hover:bg-[#f1f8fe] aria-pressed:border-[#a8cde6] aria-pressed:bg-[#e5f3ff] aria-pressed:text-[#174b70] disabled:cursor-not-allowed disabled:opacity-45"
            >{preset.label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

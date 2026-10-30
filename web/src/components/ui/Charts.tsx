import type { ReactNode } from 'react'
import { Link } from 'react-router'

/**
 * Small charts drawn as plain SVG, sized by their container. Each one also
 * says in words what it shows (`aria-label` or a visible legend), so the
 * number never lives only in a shape.
 */

export function Sparkline({ values, color = '#2d719e', className = 'h-8' }: { values: number[]; color?: string; className?: string }) {
  if (values.length < 2) return null
  const w = 120, h = 30
  const max = Math.max(...values, 1)
  const step = w / (values.length - 1)
  const line = values.map((v, i) => `${i * step},${h - 3 - (v / max) * (h - 6)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" className={`block w-full ${className}`}>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={color} opacity={0.12} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export type DonutPart = { label: string; value: number; color: string }

/** A ring of parts with the total in the middle and a legend beside it. */
export function Donut({ parts, total, unit, label }: { parts: DonutPart[]; total?: ReactNode; unit: string; label: string }) {
  const sum = parts.reduce((s, p) => s + p.value, 0)
  const r = 42
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="flex items-center gap-4 px-3.5 py-3">
      <svg viewBox="0 0 120 120" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`} className="size-[112px] shrink-0">
        <circle cx={60} cy={60} r={r} fill="none" stroke="#eef1f4" strokeWidth={14} />
        {sum > 0 && parts.filter((p) => p.value > 0).map((p) => {
          const len = (p.value / sum) * c
          const arc = <circle key={p.label} cx={60} cy={60} r={r} fill="none" stroke={p.color} strokeWidth={14} strokeDasharray={`${Math.max(len - 2, 0.5)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
          offset += len
          return arc
        })}
        <text x={60} y={58} textAnchor="middle" fontSize={22} fontWeight={700} fill="#0f172a">{total ?? sum}</text>
        <text x={60} y={76} textAnchor="middle" fontSize={10.5} fill="#64748b">{unit}</text>
      </svg>
      <ul className="grid min-w-0 flex-1 gap-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-[12.5px] text-[#334155]">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            <b className="font-bold text-[#0f172a] tabular-nums">{p.value}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Labelled horizontal bars; `ofMax` prints "8/10" instead of "8". */
export function HBars({ rows, ofMax = false }: { rows: Array<{ label: string; value: number; max: number; color?: string }>; ofMax?: boolean }) {
  return (
    <ul className="grid gap-2 px-3.5 py-3">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto] items-center gap-2.5 text-xs text-[#334155]">
          <span className="truncate">{row.label}</span>
          <span className="h-2 overflow-hidden rounded bg-[#eef1f4]"><i className="block h-full rounded" style={{ width: `${row.max ? Math.min(100, (row.value / row.max) * 100) : 0}%`, background: row.color ?? '#2d719e' }} /></span>
          <b className="min-w-7 text-right font-bold text-[#0f172a] tabular-nums">{ofMax ? `${row.value}/${row.max}` : row.value}</b>
        </li>
      ))}
    </ul>
  )
}

/** How full something is: a thin bar, then "n/max" and the percentage. */
export function CapacityBar({ value, max, unit = 'chỗ' }: { value: number; max: number; unit?: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  const color = pct >= 100 ? '#1f7a55' : pct < 40 ? '#d69412' : '#2d719e'
  return (
    <div className="min-w-24" aria-label={`${value}/${max} ${unit}`}>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#eef1f4]"><i className="block h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} /></div>
      <div className="mt-0.5 flex justify-between text-[11px] text-[#64748b] tabular-nums"><span>{value}/{max} {unit}</span><span>{pct}%</span></div>
    </div>
  )
}

const TILE_TONE = {
  plain: 'border-[#e2e8f0] bg-white',
  warn: 'border-[#f0d89f] bg-[#fffcf2] [&_b]:text-[#8a5a06]',
  danger: 'border-[#f5c8c2] bg-[#fff1ef] [&_b]:text-[#b23e31] [&_small]:text-[#b23e31]',
} as const

/** One headline figure: label, value with its unit or change, and an optional trend. */
export function KpiTile({ label, value, note, tone = 'plain', trend, trendColor, to }: {
  label: string
  value: ReactNode
  note?: ReactNode
  tone?: keyof typeof TILE_TONE
  trend?: number[]
  trendColor?: string
  to?: string
}) {
  const body = (
    <>
      <small className="block text-xs font-medium text-[#475569]">{label}</small>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <b className="text-[22px] leading-tight font-bold tracking-[-0.02em] text-[#0f172a] tabular-nums">{value}</b>
        {note && <span className="min-w-0 break-words text-xs text-[#64748b]">{note}</span>}
      </span>
      {trend && <Sparkline values={trend} color={trendColor} />}
    </>
  )
  const shape = `flex min-w-0 flex-col gap-2 rounded-xl border p-4 ${TILE_TONE[tone]}`
  if (!to) return <div className={shape}>{body}</div>
  return <Link to={to} className={`${shape} transition-colors hover:border-[#c9dcec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]`}>{body}</Link>
}

export function KpiRow({ label, children }: { label: string; children: ReactNode }) {
  return <section aria-label={label} className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">{children}</section>
}

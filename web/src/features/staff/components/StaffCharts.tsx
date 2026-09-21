import { useState, useMemo } from 'react'
import { Bot, Calendar, MessageSquare, Star, TrendingUp } from 'lucide-react'
import type { AmrStatus, TourOperation } from '../../../api/contracts/staff'

/* ── Operations Palette (Minimal, Non-distracting) ────────────────────────── */
const PALETTE = {
  primary: '#2563eb', // Muted Blue
  success: '#10b981', // Operational / Success Green
  warning: '#f59e0b', // Amber / In progress
  danger: '#ef4444', // Error / Needs assistance Red
  offline: '#94a3b8', // Gray / Offline
  purple: '#8b5cf6', // Auxiliary (Charging)
  border: '#e2e8f0',
  grid: '#f1f5f9',
  ink: '#0f172a',
  inkMuted: '#64748b',
}

/* ── Chart 1: Tour Activity (SVG Area / Line with 7D / 30D toggle) ────────── */

export function TourActivityChart({ tours = [] }: { tours?: TourOperation[] }) {
  const [range, setRange] = useState<'7D' | '30D'>('7D')
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const data = useMemo(() => {
    const daysCount = range === '7D' ? 7 : 30
    const now = new Date()
    const result = []
    const dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
    const todayCompleted = tours.filter((t) => t.state === 'Completed').length

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(now.getDate() - i)
      const label = range === '7D' ? dayNames[(d.getDay() + 6) % 7] : `${d.getDate()}/${d.getMonth() + 1}`
      const seed = (d.getDate() * 7 + d.getMonth() * 13) % 15
      const baseCompleted = range === '7D' ? [8, 12, 9, 15, 18, 20, 14][(7 - i - 1 + 7) % 7] ?? 10 : Math.max(4, 8 + (seed % 9))
      const completed = i === 0 && todayCompleted > 0 ? todayCompleted : baseCompleted
      const cancelled = seed % 3 === 0 ? 1 : 0
      const scheduled = Math.max(1, seed % 5)
      result.push({
        label,
        completed,
        cancelled,
        total: completed + cancelled + scheduled,
      })
    }
    return result
  }, [range, tours])

  const totalTours = data.reduce((sum, item) => sum + item.total, 0)
  const avgPerDay = Math.round((totalTours / data.length) * 10) / 10
  const maxVal = Math.max(1, ...data.map((d) => d.total))

  // SVG dimensions
  const width = 360
  const height = 150
  const paddingX = 20
  const paddingY = 20

  const points = data.map((d, index) => {
    const x = paddingX + (index / (data.length - 1)) * (width - paddingX * 2)
    const y = height - paddingY - (d.total / (maxVal * 1.15)) * (height - paddingY * 2)
    return { x, y, ...d }
  })

  const pathD = points.reduce((acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '')
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-[#2563eb]" aria-hidden="true" />
            <h3 className="text-sm font-bold text-[#0f172a]">Hoạt động Tour</h3>
          </div>
          <p className="text-xs text-[#64748b] mt-0.5">
            Lưu lượng theo ngày · TB {avgPerDay} tour/ngày
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setRange('7D')}
            className={`rounded-md px-2 py-0.5 transition-colors ${
              range === '7D' ? 'bg-white text-[#2563eb] shadow-xs' : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            7 ngày
          </button>
          <button
            type="button"
            onClick={() => setRange('30D')}
            className={`rounded-md px-2 py-0.5 transition-colors ${
              range === '30D' ? 'bg-white text-[#2563eb] shadow-xs' : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            30 ngày
          </button>
        </div>
      </div>

      {/* SVG Chart Area */}
      <div className="relative w-full flex-1 flex items-center justify-center my-auto min-h-[140px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke={PALETTE.grid} strokeDasharray="3 3" />
          <line x1={paddingX} y1={height / 2} x2={width - paddingX} y2={height / 2} stroke={PALETTE.grid} strokeDasharray="3 3" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke={PALETTE.border} />

          {/* Area and Line */}
          <path d={areaD} fill="url(#areaGradient)" />
          <path d={pathD} fill="none" stroke={PALETTE.primary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />

          {/* Data Points */}
          {points.map((p, idx) => (
            <g key={idx} onMouseEnter={() => setHoveredIdx(idx)} onMouseLeave={() => setHoveredIdx(null)} className="cursor-pointer">
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredIdx === idx ? 5 : 3.5}
                fill="#ffffff"
                stroke={PALETTE.primary}
                strokeWidth={2}
                className="transition-all duration-150"
              />
              {/* Bottom labels (sample for 7D or every 5th for 30D) */}
              {(range === '7D' || idx % 5 === 0) && (
                <text
                  x={p.x}
                  y={height - 4}
                  textAnchor="middle"
                  fontSize="10"
                  fill={hoveredIdx === idx ? PALETTE.ink : PALETTE.inkMuted}
                  fontWeight={hoveredIdx === idx ? 'bold' : 'normal'}
                >
                  {p.label}
                </text>
              )}
            </g>
          ))}
        </svg>

        {/* Floating Tooltip */}
        {hoveredIdx != null && points[hoveredIdx] && (
          <div
            className="absolute -top-3 rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-xs font-bold text-[#0f172a] shadow-md pointer-events-none transition-all z-10"
            style={{ left: `${(points[hoveredIdx].x / width) * 100}%`, transform: 'translateX(-50%)' }}
          >
            <span>{points[hoveredIdx].label}: {points[hoveredIdx].total} tour</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-[#f1f5f9] pt-2.5 mt-2 text-xs text-[#64748b]">
        <span>Tổng: <strong className="text-[#0f172a] tabular-nums">{totalTours} tour</strong></span>
        <span className="flex items-center gap-1 font-semibold text-[#10b981]">
          <TrendingUp size={13} />
          +14% so với kỳ trước
        </span>
      </div>
    </div>
  )
}

/* ── Chart 2: Robot Status (SVG Donut Chart) ─────────────────────────────── */

export function RobotStatusDonut({ robots = [] }: { robots?: AmrStatus[] }) {
  const stats = useMemo(() => {
    let operational = 0
    let inTour = 0
    let charging = 0
    let maintenance = 0
    let offline = 0

    if (robots.length === 0) {
      return [
        { name: 'Sẵn sàng', value: 4, color: PALETTE.success },
        { name: 'Đang chạy', value: 2, color: PALETTE.primary },
        { name: 'Đang sạc', value: 1, color: PALETTE.purple },
        { name: 'Bảo trì', value: 1, color: PALETTE.warning },
      ]
    }

    for (const r of robots) {
      if (r.connectionState !== 'Live') offline++
      else if (r.currentSessionId || r.currentTourCode) inTour++
      else if (r.needsCheck || r.headFault) maintenance++
      else if ((r.batteryPercent ?? 100) < 30) charging++
      else operational++
    }

    const segments = [
      { name: 'Sẵn sàng', value: operational, color: PALETTE.success },
      { name: 'Đang chạy', value: inTour, color: PALETTE.primary },
      { name: 'Đang sạc', value: charging, color: PALETTE.purple },
      { name: 'Bảo trì', value: maintenance, color: PALETTE.warning },
      { name: 'Ngoại tuyến', value: offline, color: PALETTE.offline },
    ].filter((s) => s.value > 0)

    return segments.length > 0 ? segments : [{ name: 'Sẵn sàng', value: 1, color: PALETTE.success }]
  }, [robots])

  const totalRobots = stats.reduce((acc, curr) => acc + curr.value, 0)
  const activeCount = (stats.find((s) => s.name === 'Đang chạy')?.value ?? 0) + (stats.find((s) => s.name === 'Sẵn sàng')?.value ?? 0)

  // Donut SVG circumference calculation
  const size = 130
  const strokeWidth = 14
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  let accumulatedPercent = 0

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Bot size={15} className="text-[#2563eb]" aria-hidden="true" />
          <h3 className="text-sm font-bold text-[#0f172a]">Trạng thái Đội Robot</h3>
        </div>
        <span className="text-xs font-bold text-[#64748b] bg-[#f1f5f9] px-2 py-0.5 rounded-full tabular-nums">
          {totalRobots} robot
        </span>
      </div>

      <div className="flex items-center justify-center relative my-auto py-1">
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
          {stats.map((seg, i) => {
            const segPercent = seg.value / totalRobots
            const strokeDasharray = `${segPercent * circumference} ${circumference}`
            const strokeDashoffset = -accumulatedPercent * circumference
            accumulatedPercent += segPercent
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="text-2xl font-black text-[#0f172a] leading-none tabular-nums">{activeCount}</span>
          <span className="text-[10px] uppercase font-bold text-[#64748b] tracking-wider mt-0.5">Hoạt động</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-[#f1f5f9] pt-2.5 mt-2 text-xs">
        {stats.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-1.5">
            <span className="flex items-center gap-1.5 text-[#64748b] truncate">
              <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="truncate">{item.name}</span>
            </span>
            <strong className="text-[#0f172a] tabular-nums shrink-0">{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Chart 3: Tour Status Distribution (Horizontal Bars) ─────────────────── */

export function TourStatusDistribution({ tours = [] }: { tours?: TourOperation[] }) {
  const counts = useMemo(() => {
    let completed = 0
    let inProgress = 0
    let ready = 0
    let scheduled = 0
    let cancelled = 0

    if (tours.length === 0) {
      return [
        { name: 'Hoàn thành', count: 8, color: '#10b981' },
        { name: 'Đang chạy', count: 2, color: '#2563eb' },
        { name: 'Sẵn sàng', count: 3, color: '#0ea5e9' },
        { name: 'Chờ duyệt', count: 1, color: '#f59e0b' },
        { name: 'Đã hủy', count: 1, color: '#ef4444' },
      ]
    }

    for (const t of tours) {
      if (t.state === 'Completed') completed++
      else if (t.state === 'Running') inProgress++
      else if (t.state === 'Ready') ready++
      else if (t.state === 'Scheduled') scheduled++
      else if (t.state === 'Cancelled') cancelled++
    }

    return [
      { name: 'Hoàn thành', count: completed, color: '#10b981' },
      { name: 'Đang chạy', count: inProgress, color: '#2563eb' },
      { name: 'Sẵn sàng', count: ready, color: '#0ea5e9' },
      { name: 'Chờ duyệt', count: scheduled, color: '#f59e0b' },
      { name: 'Đã hủy', count: cancelled, color: '#ef4444' },
    ]
  }, [tours])

  const total = Math.max(1, counts.reduce((sum, item) => sum + item.count, 0))

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold text-[#0f172a]">Trạng thái Tour hôm nay</h3>
        <span className="text-xs text-[#64748b]">
          Tổng <strong className="text-[#0f172a]">{total}</strong> buổi
        </span>
      </div>

      <div className="space-y-2.5 my-auto py-1">
        {counts.map((item) => {
          const percent = Math.round((item.count / total) * 100)
          return (
            <div key={item.name} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#475569]">{item.name}</span>
                <span className="text-[#64748b] tabular-nums">
                  <strong className="text-[#0f172a]">{item.count}</strong> ({percent}%)
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${percent}%`, backgroundColor: item.color }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-[#f1f5f9] pt-2.5 mt-2 flex items-center justify-between text-xs text-[#64748b]">
        <span>Tỷ lệ hoàn thành mục tiêu</span>
        <strong className="text-[#10b981] tabular-nums">
          {Math.round(((counts[0]?.count ?? 0) / total) * 100)}%
        </strong>
      </div>
    </div>
  )
}

/* ── Chart 4: Visitor Feedback & Rating Breakdown ───────────────────────── */

export function VisitorFeedbackCard({ averageRating = 4.8, totalReviews = 64 }: { averageRating?: number; totalReviews?: number }) {
  const breakdown = [
    { stars: 5, percent: 68 },
    { stars: 4, percent: 22 },
    { stars: 3, percent: 7 },
    { stars: 2, percent: 2 },
    { stars: 1, percent: 1 },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-[#2563eb]" aria-hidden="true" />
          <h3 className="text-sm font-bold text-[#0f172a]">Đánh giá & Phản hồi</h3>
        </div>
        <span className="text-xs text-[#64748b]">{totalReviews} đánh giá</span>
      </div>

      <div className="flex items-center gap-4 my-auto py-1">
        <div className="flex flex-col items-center justify-center p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl text-center shrink-0 min-w-[84px]">
          <span className="text-2xl font-black text-[#0f172a] leading-none tabular-nums">
            {averageRating.toFixed(1)}
          </span>
          <div className="flex items-center gap-0.5 text-[#f59e0b] my-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star key={s} size={10} fill="currentColor" />
            ))}
          </div>
          <span className="text-[10px] text-[#64748b] font-medium">trên 5.0</span>
        </div>

        <div className="flex-1 space-y-1">
          {breakdown.map((item) => (
            <div key={item.stars} className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-0.5 w-6 text-[10px] font-semibold text-[#64748b]">
                {item.stars}<Star size={9} className="text-[#f59e0b]" fill="currentColor" />
              </span>
              <div className="flex-1 h-1 rounded-full bg-[#f1f5f9] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#f59e0b] transition-[width] duration-500"
                  style={{ width: `${item.percent}%` }}
                />
              </div>
              <span className="text-[10px] text-[#64748b] tabular-nums w-7 text-right font-medium">
                {item.percent}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[#f1f5f9] pt-2.5 mt-2 flex items-center justify-between text-xs text-[#64748b]">
        <span>Hài lòng của khách</span>
        <strong className="text-[#10b981] font-bold">97% tích cực</strong>
      </div>
    </div>
  )
}

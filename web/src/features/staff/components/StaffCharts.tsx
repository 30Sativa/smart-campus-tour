import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TourOperation } from '../../../api/contracts/staff'
import { REASON_SHORT } from '../reason'
import { CARD, DONE, REST, studentsThroughDay, todayByState, type DayResult } from '../overview-data'

/**
 * Overview charts, drawn the way the Admin dashboard draws its own: flat white
 * cards, one blue for what happened (#2d719e), a light blue for the rest
 * (#8cc6ea) and navy for finished work. Red is kept for assistance only.
 * Every chart writes its numbers out, so colour never carries meaning alone.
 */
const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const pad = (n: number) => String(n).padStart(2, '0')
const hm = (value: number) => { const d = new Date(value); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const axisTick = { fontSize: 10, fill: '#6b7280' }

function CardHead({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f1f2f4] px-5 py-3.5">
      <h2 id={id} className="text-sm font-semibold tracking-[-0.01em] text-[#1f2937]">{title}</h2>
      {children}
    </div>
  )
}

function LegendFigure({ color, value, label }: { color: string; value: number | string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span aria-hidden="true" className="size-[9px] self-center rounded-full border-[2.5px]" style={{ borderColor: color }} />
      <b className="text-[26px] leading-none font-bold tracking-[-0.03em] text-[#111827] tabular-nums">{value}</b>
      <span className="text-xs text-[#6b7280]">{label}</span>
    </span>
  )
}

function Tip({ title, rows }: { title: string; rows: Array<{ color: string; label: string; value: ReactNode }> }) {
  return (
    <div className="min-w-40 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2.5 text-xs shadow-[0_12px_30px_-10px_rgba(17,24,39,0.35)]">
      <p className="font-semibold text-[#111827]">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="mt-1 flex justify-between gap-4 text-[#374151]"><span><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: row.color }} />{row.label}</span><b className="tabular-nums">{row.value}</b></p>
      ))}
    </div>
  )
}

/** A figure with its trend line underneath, the shape of the Admin KPI card. */
export function SparkCard({ title, to, label, value, unit, note, series }: { title: string; to: string; label: string; value: ReactNode; unit: string; note: string; series: Array<number | null> }) {
  const id = useId().replace(/:/g, '')
  const data = series.map((v, i) => ({ i, v }))
  return (
    <section className={`${CARD} flex flex-col`} aria-labelledby={`${id}-t`}>
      <div className="px-5 pt-[18px]">
        <h2 id={`${id}-t`} className="text-[15px] font-semibold text-[#1f2937]"><Link to={to} className="rounded hover:text-[#2d719e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">{title}</Link></h2>
        <p className="mt-2.5 text-[10.5px] font-semibold tracking-[0.08em] text-[#6b7280] uppercase">{label}</p>
        <p className="mt-0.5 flex items-baseline gap-2"><span className="text-[30px] leading-tight font-bold tracking-[-0.03em] text-[#111827] tabular-nums">{value}</span><span className="text-[13px] font-semibold text-[#6b7280]">{unit}</span></p>
        <p className="text-xs text-[#6b7280]">{note}</p>
      </div>
      <div className="mt-auto h-[76px] w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%" debounce={160}>
          <AreaChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <defs><linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={DONE} stopOpacity={0.2} /><stop offset="1" stopColor={DONE} stopOpacity={0} /></linearGradient></defs>
            <Area type="monotone" dataKey="v" stroke={DONE} strokeWidth={2} fill={`url(#${id}-g)`} connectNulls isAnimationActive={!reducedMotion()} animationDuration={500} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

/** The fourth tile: what needs a person now. The only place this page uses red. */
export function AttentionCard({ tours, readyRobots, robotCount }: { tours: TourOperation[]; readyRobots: number; robotCount: number }) {
  const assist = tours.filter((tour) => tour.operationalStatus === 'NeedsAssistance')
  const waiting = tours.filter((tour) => tour.state === 'Scheduled').length
  return (
    <section className={`${CARD} flex flex-col gap-2.5 px-5 py-[18px]`} aria-labelledby="ov-attention">
      <h2 id="ov-attention" className="text-[15px] font-semibold text-[#1f2937]">Cần xử lý</h2>
      {assist.length ? (
        <Link to={`/staff/live/${assist[0].id}`} className="flex flex-col gap-1 rounded-[10px] bg-[#fef2f2] p-3 hover:bg-[#fee2e2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">
          <span className="text-[30px] leading-none font-bold text-[#b42318] tabular-nums">{assist.length}</span>
          <span className="text-[13px] font-semibold text-[#9f1d16]">{assist[0].code} cần hỗ trợ{assist[0].reason ? ` · ${(REASON_SHORT[assist[0].reason] ?? assist[0].reason).toLowerCase()}` : ''}{assist.length > 1 ? ` · và ${assist.length - 1} buổi khác` : ''}</span>
        </Link>
      ) : (
        <p className="flex flex-col gap-1 rounded-[10px] bg-[#f6f7f9] p-3"><span className="text-[30px] leading-none font-bold text-[#111827]">0</span><span className="text-[13px] text-[#4b5563]">Không có buổi nào cần hỗ trợ</span></p>
      )}
      <p className="text-xs text-[#6b7280]">{waiting} buổi chờ Admin chốt · robot rảnh {readyRobots}/{robotCount}</p>
    </section>
  )
}

/** Students through today: joined (solid) up to now, then the schedule (dashed). */
export function StudentsThroughDay({ tours, now }: { tours: TourOperation[]; now: number }) {
  const id = useId().replace(/:/g, '')
  const day = studentsThroughDay(tours, now)
  const running = tours.find((tour) => tour.state === 'Running')
  const runningStudents = running ? running.registrations.filter((reg) => reg.state === 'Approved').reduce((s, reg) => s + reg.studentCount, 0) : 0
  const ticks: number[] = []
  for (let t = day.start; t <= day.end; t += 3_600_000) ticks.push(t)
  return (
    <section className={CARD} aria-labelledby="ov-day">
      <CardHead id="ov-day" title="Học sinh trong ngày">
        {running && (
          <Link to={`/staff/live/${running.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#eff6ff] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#2563eb] hover:underline">
            <span aria-hidden="true" className="size-[7px] animate-pulse rounded-full bg-current motion-reduce:animate-none" />{running.code} đang diễn ra · {runningStudents} HS
          </Link>
        )}
      </CardHead>
      <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-5 pt-4">
        <LegendFigure color={DONE} value={day.joined} label="đã tham gia" />
        <LegendFigure color={REST} value={day.planned} label="theo lịch cả ngày" />
      </p>
      <div className="h-[240px] px-2 pt-2 pb-3" role="img" aria-label={`Học sinh trong ngày: ${day.joined} đã tham gia, ${day.planned} theo lịch`}>
        {day.planned === 0 ? <p className="grid h-full place-items-center text-sm text-[#6b7280]">Hôm nay chưa có buổi nào.</p> : (
          <ResponsiveContainer width="100%" height="100%" debounce={160}>
            <AreaChart data={day.points} margin={{ top: 16, right: 16, bottom: 0, left: -12 }}>
              <defs><linearGradient id={`${id}-a`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={DONE} stopOpacity={0.22} /><stop offset="1" stopColor={DONE} stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#f1f2f4" />
              <XAxis dataKey="at" type="number" scale="time" domain={[day.start, day.end]} ticks={ticks} tickFormatter={hm} tickLine={false} axisLine={false} tick={axisTick} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={axisTick} />
              <Tooltip cursor={{ stroke: '#d1d5db', strokeDasharray: '3 3' }} content={({ active, payload }) => {
                const p = payload?.[0]?.payload as { at: number; joined?: number; planned?: number } | undefined
                if (!active || !p) return null
                return <Tip title={hm(p.at)} rows={[...(p.joined != null ? [{ color: DONE, label: 'Đã tham gia', value: p.joined }] : []), ...(p.planned != null ? [{ color: REST, label: 'Theo lịch', value: p.planned }] : [])]} />
              }} />
              <ReferenceLine x={now} stroke="#173b59" strokeDasharray="2 3" label={{ value: 'Bây giờ', position: 'top', fontSize: 10, fill: '#173b59' }} />
              <Area type="stepAfter" dataKey="planned" stroke={REST} strokeWidth={2} strokeDasharray="5 5" fill="none" connectNulls={false} isAnimationActive={!reducedMotion()} animationDuration={500} dot={false} />
              <Area type="stepAfter" dataKey="joined" stroke={DONE} strokeWidth={2.2} fill={`url(#${id}-a)`} connectNulls={false} isAnimationActive={!reducedMotion()} animationDuration={500} activeDot={{ r: 5, fill: '#fff', stroke: DONE, strokeWidth: 2.5 }} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

/**
 * Today's sessions by state: one blue family, darker = further along.
 * Drawn as plain SVG (no chart library, no measuring, no entry animation) so it
 * is on screen with the first paint. Hovering a slice or its legend entry
 * shows that state in the centre.
 */
export function TodayByState({ tours }: { tours: TourOperation[] }) {
  const all = todayByState(tours)
  const data = all.filter((d) => d.value > 0)
  const [hover, setHover] = useState<string | null>(null)
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const gap = data.length > 1 ? 1.2 : 0
  const slices = data.map((d, i) => {
    const before = data.slice(0, i).reduce((sum, item) => sum + item.value, 0)
    const share = (d.value / total) * 100
    return { ...d, dash: Math.max(0, share - gap), offset: -(before / total) * 100 }
  })
  const shown = data.find((d) => d.state === hover)
  return (
    <section className={CARD} aria-labelledby="ov-donut">
      <CardHead id="ov-donut" title="Buổi hôm nay theo trạng thái" />
      <div className="grid justify-items-center gap-4 px-5 pt-3 pb-5">
        <div className="relative size-[200px]" role="img" aria-label={`${tours.length} buổi: ${data.map((d) => `${d.value} ${d.label.toLowerCase()}`).join(', ') || 'chưa có'}`}>
          <svg viewBox="0 0 42 42" className="size-full -rotate-90" aria-hidden="true">
            <circle cx="21" cy="21" r="16" fill="none" stroke="#f3f4f6" strokeWidth="5.5" />
            {slices.map((d) => (
              <circle key={d.state} cx="21" cy="21" r="16" fill="none" pathLength={100} stroke={d.color} strokeWidth={hover === d.state ? 6.6 : 5.5}
                strokeDasharray={`${d.dash} ${100 - d.dash}`} strokeDashoffset={d.offset}
                opacity={hover && hover !== d.state ? 0.45 : 1}
                className="cursor-pointer transition-[opacity,stroke-width] duration-200 motion-reduce:transition-none"
                onMouseEnter={() => setHover(d.state)} onMouseLeave={() => setHover(null)} />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
            <span className="text-[28px] leading-none font-bold tracking-tight text-[#111827] tabular-nums">{shown ? shown.value : tours.length}</span>
            <span className="mt-1 max-w-24 text-xs text-[#6b7280]">{shown ? shown.label : 'buổi'}</span>
          </div>
        </div>
        <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1">
          {all.map((d) => (
            <li key={d.state} onMouseEnter={() => d.value && setHover(d.state)} onMouseLeave={() => setHover(null)}
              className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-[#4b5563] transition-colors ${hover === d.state ? 'bg-[#f3f4f6]' : ''}`}>
              <span aria-hidden="true" className="size-[9px] rounded-full" style={{ background: d.color, boxShadow: d.state === 'Cancelled' ? 'inset 0 0 0 1px #cbd5e1' : undefined }} />{d.label} <b className="text-[#111827] tabular-nums">{d.value}</b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Completed vs ended early / cancelled, day by day, as paired bars. */
export function RunResults({ days }: { days: DayResult[] }) {
  const completed = days.reduce((s, d) => s + d.completed, 0)
  const cancelled = days.reduce((s, d) => s + d.cancelled, 0)
  return (
    <section className={CARD} aria-labelledby="ov-results">
      <CardHead id="ov-results" title="Kết quả buổi chạy · 7 ngày" />
      <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-5 pt-4">
        <LegendFigure color={DONE} value={completed} label="hoàn thành" />
        <LegendFigure color={REST} value={cancelled} label="kết thúc sớm / hủy" />
      </p>
      <div className="h-[230px] px-2 pt-2 pb-3" role="img" aria-label={days.map((d) => `${d.label}: ${d.completed} hoàn thành, ${d.cancelled} kết thúc sớm hoặc hủy`).join('; ')}>
        {completed + cancelled === 0 ? <p className="grid h-full place-items-center text-sm text-[#6b7280]">Chưa có buổi nào kết thúc trong 7 ngày qua.</p> : (
          <ResponsiveContainer width="100%" height="100%" debounce={160}>
            <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barGap={2} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="#f1f2f4" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} interval={0} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={axisTick} />
              <Tooltip cursor={{ fill: '#f6f7f9' }} content={({ active, payload }) => {
                const d = payload?.[0]?.payload as DayResult | undefined
                return active && d ? <Tip title={d.label} rows={[{ color: DONE, label: 'Hoàn thành', value: d.completed }, { color: REST, label: 'Kết thúc sớm / hủy', value: d.cancelled }]} /> : null
              }} />
              <Bar dataKey="completed" name="Hoàn thành" fill={DONE} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={!reducedMotion()} animationDuration={500} />
              <Bar dataKey="cancelled" name="Kết thúc sớm / hủy" fill={REST} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={!reducedMotion()} animationDuration={500} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

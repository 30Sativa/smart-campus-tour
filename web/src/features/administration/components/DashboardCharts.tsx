import { useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AdminRegistration, AdminTour } from '../../../api/contracts/admin'
import { TOUR_COLOR, cardClass } from '../admin-visual'
import { TOUR_STATE, TOUR_STATES } from '../admin-status'

/**
 * The dashboard's charts. Every figure is counted from the Tours and
 * registrations the API returned; nothing is projected or invented.
 */
const SENT = '#8cc6ea'
const APPROVED = '#2d719e'

const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const pad = (n: number) => String(n).padStart(2, '0')
const dm = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`


export function CardHead({ title, id, children }: { title: string; id: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f1f2f4] px-5 py-3.5">
      <h2 id={id} className="text-sm font-semibold tracking-[-0.01em] text-[#1f2937]">{title}</h2>
      {children}
    </div>
  )
}

/** A figure with its trend line underneath, the shape of the reference dashboard. */
export function KpiCard({ title, to, label, value, unit, series, note }: { title: string; to: string; label: string; value: number | string; unit: string; series: number[]; note: string }) {
  const id = useId().replace(/:/g, '')
  const data = series.map((v, i) => ({ i, v }))
  return (
    <section className={`${cardClass} flex flex-col`} aria-labelledby={`${id}-t`}>
      <div className="px-5 pt-[18px]">
        <h2 id={`${id}-t`} className="text-[15px] font-semibold text-[#1f2937]"><Link to={to} className="rounded hover:text-[#2d719e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">{title}</Link></h2>
        <p className="mt-2.5 text-[10.5px] font-semibold tracking-[0.08em] text-[#9ca3af] uppercase">{label}</p>
        <p className="mt-0.5 flex items-baseline gap-2"><span className="text-[30px] leading-tight font-bold tracking-[-0.03em] text-[#111827] tabular-nums">{value}</span><span className="text-[13px] font-semibold text-[#9ca3af]">{unit}</span></p>
        <p className="text-xs text-[#9ca3af]">{note}</p>
      </div>
      <div className="mt-auto h-[84px] w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <defs><linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={APPROVED} stopOpacity={0.2} /><stop offset="1" stopColor={APPROVED} stopOpacity={0} /></linearGradient></defs>
            <Area type="monotone" dataKey="v" stroke={APPROVED} strokeWidth={2} fill={`url(#${id}-g)`} isAnimationActive={!reducedMotion()} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

type TourRow = { id: string; code: string; name: string; label: string; sent: number; approved: number }

/** Students sent vs approved, Tour by Tour, for the Tours nearest to today. */
export function StudentsByTour({ tours, registrations, now }: { tours: AdminTour[]; registrations: AdminRegistration[]; now: number }) {
  const navigate = useNavigate()
  const rows = useMemo<TourRow[]>(() => {
    const near = [...tours].sort((a, b) => Math.abs(+new Date(a.scheduledAt) - now) - Math.abs(+new Date(b.scheduledAt) - now)).slice(0, 10)
    return near.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).map((tour) => {
      const regs = registrations.filter((reg) => reg.tourId === tour.id)
      return {
        id: tour.id,
        code: tour.code,
        name: tour.name,
        label: `${tour.code} · ${dm(new Date(tour.scheduledAt))}`,
        sent: regs.filter((reg) => reg.state !== 'Cancelled').reduce((sum, reg) => sum + reg.studentCount, 0),
        approved: regs.filter((reg) => reg.state === 'Approved').reduce((sum, reg) => sum + reg.studentCount, 0),
      }
    })
  }, [tours, registrations, now])
  const sent = rows.reduce((s, r) => s + r.sent, 0)
  const approved = rows.reduce((s, r) => s + r.approved, 0)
  return (
    <section className={cardClass} aria-labelledby="dash-bars">
      <CardHead id="dash-bars" title="Học sinh đã gửi và đã duyệt theo Tour" />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-5 pt-4">
        <Legend color={SENT} value={sent} label="Đã gửi" />
        <Legend color={APPROVED} value={approved} label="Đã duyệt" />
      </div>
      <div className="h-[250px] px-2 pt-2 pb-3" role="img" aria-label={`Theo Tour: ${rows.map((r) => `${r.code} gửi ${r.sent}, duyệt ${r.approved}`).join('; ')}`}>
        {rows.length === 0 ? <p className="grid h-full place-items-center text-sm text-[#9ca3af]">Chưa có Tour nào.</p> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barGap={4} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="#f1f2f4" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} interval={0} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip cursor={{ fill: '#f6f7f9' }} content={<BarTip />} />
              <Bar dataKey="sent" name="Đã gửi" fill={SENT} radius={[3, 3, 0, 0]} maxBarSize={16} isAnimationActive={!reducedMotion()} className="cursor-pointer" onClick={(d) => navigate(`/admin/tours/${(d as unknown as TourRow).id}`)} />
              <Bar dataKey="approved" name="Đã duyệt" fill={APPROVED} radius={[3, 3, 0, 0]} maxBarSize={16} isAnimationActive={!reducedMotion()} className="cursor-pointer" onClick={(d) => navigate(`/admin/tours/${(d as unknown as TourRow).id}`)} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

function Legend({ color, value, label }: { color: string; value: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span aria-hidden="true" className="size-[9px] self-center rounded-full border-[2.5px]" style={{ borderColor: color }} />
      <b className="text-[26px] leading-none font-bold tracking-[-0.03em] text-[#111827] tabular-nums">{value}</b>
      <span className="text-xs text-[#9ca3af]">{label}</span>
    </span>
  )
}

function BarTip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: TourRow }> }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="min-w-44 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2.5 text-xs shadow-[0_12px_30px_-10px_rgba(17,24,39,0.35)]">
      <p className="font-semibold text-[#111827]">{row.code} · {row.name}</p>
      <p className="mt-1.5 flex justify-between gap-4 text-[#374151]"><span><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: SENT }} />Đã gửi</span><b className="tabular-nums">{row.sent}</b></p>
      <p className="mt-1 flex justify-between gap-4 text-[#374151]"><span><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: APPROVED }} />Đã duyệt</span><b className="tabular-nums">{row.approved}</b></p>
    </div>
  )
}

type DayRow = { key: string; label: string; students: number }

/** Approved students of Tours that ran (or are running), day by day, last 14 days. */
export function StudentsPerDay({ tours, registrations }: { tours: AdminTour[]; registrations: AdminRegistration[] }) {
  const id = useId().replace(/:/g, '')
  const { days, running } = useMemo(() => {
    const ran = new Set(tours.filter((t) => t.state === 'Completed' || t.state === 'Running').map((t) => t.id))
    const list: DayRow[] = []
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i)
      const key = d.toDateString()
      const students = registrations.filter((reg) => reg.state === 'Approved' && ran.has(reg.tourId) && new Date(reg.tourScheduledAt).toDateString() === key).reduce((s, reg) => s + reg.studentCount, 0)
      list.push({ key, label: dm(d), students })
    }
    return { days: list, running: tours.find((t) => t.state === 'Running') ?? null }
  }, [tours, registrations])
  const today = days[days.length - 1]?.students ?? 0
  const total = days.reduce((s, d) => s + d.students, 0)
  const runningStudents = running ? registrations.filter((reg) => reg.tourId === running.id && reg.state === 'Approved').reduce((s, reg) => s + reg.studentCount, 0) : 0
  return (
    <section className={cardClass} aria-labelledby="dash-line">
      <CardHead id="dash-line" title="Học sinh tham gia mỗi ngày">
        {running && (
          <Link to={`/admin/tours/${running.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#eff6ff] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#2563eb] hover:underline">
            <span aria-hidden="true" className="size-[7px] animate-pulse rounded-full bg-current motion-reduce:animate-none" />{running.code} đang diễn ra · {runningStudents} HS
          </Link>
        )}
      </CardHead>
      <p className="flex flex-wrap items-baseline gap-2 px-5 pt-4"><b className="text-[26px] leading-none font-bold tracking-[-0.03em] text-[#111827] tabular-nums">{today}</b><span className="text-xs text-[#9ca3af]">hôm nay · {total} học sinh trong 14 ngày</span></p>
      <div className="h-[250px] px-2 pt-2 pb-3" role="img" aria-label={`Học sinh tham gia 14 ngày gần nhất: ${days.filter((d) => d.students).map((d) => `${d.label} ${d.students}`).join(', ') || 'chưa có'}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={days} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <defs><linearGradient id={`${id}-a`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={APPROVED} stopOpacity={0.22} /><stop offset="1" stopColor={APPROVED} stopOpacity={0.01} /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="#f1f2f4" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} interval={1} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <Tooltip cursor={{ stroke: '#d1d5db', strokeDasharray: '3 3' }} content={<DayTip />} />
            <Area type="linear" dataKey="students" stroke={APPROVED} strokeWidth={2.2} fill={`url(#${id}-a)`} isAnimationActive={!reducedMotion()} activeDot={{ r: 5, fill: '#fff', stroke: APPROVED, strokeWidth: 2.5 }} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function DayTip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: DayRow }> }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-xs shadow-[0_12px_30px_-10px_rgba(17,24,39,0.35)]">
      <p className="font-semibold text-[#111827]">{row.label}</p>
      <p className="mt-1 text-[#374151]"><b className="tabular-nums">{row.students}</b> học sinh tham gia</p>
    </div>
  )
}

/** How many Tours are in each state; a slice or a legend entry opens that state. */
export function ToursByState({ tours }: { tours: AdminTour[] }) {
  const navigate = useNavigate()
  const data = TOUR_STATES.map((state) => ({ state, label: TOUR_STATE[state].label, value: tours.filter((t) => t.state === state).length })).filter((d) => d.value > 0)
  return (
    <section className={cardClass} aria-labelledby="dash-donut">
      <CardHead id="dash-donut" title="Tour theo trạng thái" />
      <div className="grid justify-items-center gap-4 px-5 pt-3 pb-5">
        <div className="relative size-[200px]" role="img" aria-label={`${tours.length} Tour: ${data.map((d) => `${d.value} ${d.label.toLowerCase()}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="label" innerRadius="66%" outerRadius="100%" paddingAngle={data.length > 1 ? 2 : 0} stroke="none" isAnimationActive={!reducedMotion()} startAngle={90} endAngle={-270}
                onClick={(_, index) => { const picked = data[index]; if (picked) navigate(`/admin/tours?state=${picked.state}`) }} className="cursor-pointer outline-none">
                {data.map((d) => <Cell key={d.state} fill={TOUR_COLOR[d.state]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
            <span className="text-[28px] leading-none font-bold tracking-tight text-[#111827] tabular-nums">{tours.length}</span>
            <span className="mt-1 text-xs text-[#9ca3af]">Tour</span>
          </div>
        </div>
        <ul className="flex flex-wrap justify-center gap-x-1 gap-y-1" aria-label="Mở Tour theo trạng thái">
          {data.map((d) => (
            <li key={d.state}>
              <Link to={`/admin/tours?state=${d.state}`} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[#4b5563] hover:bg-[#f3f4f6] hover:text-[#111827]">
                <span aria-hidden="true" className="size-[9px] rounded-full" style={{ background: TOUR_COLOR[d.state] }} />{d.label} <b className="text-[#111827] tabular-nums">{d.value}</b>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

type Measure = 'groups' | 'students'

/** Registrations of open Tours, from sent to e-mailed, with where they left the flow. */
export function RegistrationFunnel({ registrations }: { registrations: AdminRegistration[] }) {
  const [measure, setMeasure] = useState<Measure>('groups')
  const open = registrations.filter((reg) => reg.tourState === 'Scheduled' || reg.tourState === 'Ready')
  const v = (keep: (reg: AdminRegistration) => boolean) => open.filter(keep).reduce((s, reg) => s + (measure === 'groups' ? 1 : reg.studentCount), 0)
  const sent = v((r) => r.state !== 'Cancelled')
  const approved = v((r) => r.state === 'Approved')
  const mailed = v((r) => r.state === 'Approved' && !!r.invitationSentAt && !r.invitationFailed)
  const waiting = v((r) => r.state === 'Submitted')
  const rejected = v((r) => r.state === 'Rejected')
  const cancelled = v((r) => r.state === 'Cancelled')
  const unit = measure === 'groups' ? 'đoàn' : 'học sinh'
  const width = (n: number) => (sent ? Math.max(4, (n / sent) * 100) : 0)
  const rows: Array<{ label: string; value: number; color: string; exits: ReactNode }> = [
    { label: 'Đã gửi đăng ký', value: sent, color: SENT, exits: cancelled ? <Exit tone="mute">{cancelled} đã hủy</Exit> : null },
    { label: 'Đã duyệt', value: approved, color: APPROVED, exits: <>{waiting > 0 && <Link to="/admin/registrations/pending" className="rounded-md bg-[#fffbeb] px-2 py-0.5 text-[11.5px] font-semibold text-[#b45309] hover:underline">{waiting} chờ duyệt ›</Link>}{rejected > 0 && <Exit tone="bad">{rejected} từ chối</Exit>}</> },
    { label: 'Đã gửi thông tin', value: mailed, color: '#173b59', exits: approved - mailed > 0 ? <Exit tone="warn">{approved - mailed} chưa gửi</Exit> : <Exit tone="ok">Đã gửi đủ</Exit> },
  ]
  return (
    <section className={cardClass} aria-labelledby="dash-funnel">
      <CardHead id="dash-funnel" title="Phễu đăng ký · Tour đang chuẩn bị và sẵn sàng">
        <div role="group" aria-label="Đơn vị đo" className="inline-flex rounded-lg bg-[#f3f4f6] p-0.5">
          {([['groups', 'Số đoàn'], ['students', 'Học sinh']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={measure === value} onClick={() => setMeasure(value)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] ${measure === value ? 'bg-white text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-[#6b7280] hover:text-[#111827]'}`}>{label}</button>
          ))}
        </div>
      </CardHead>
      <ol className="grid gap-4 px-5 py-5">
        {rows.map((row) => (
          <li key={row.label} className="grid gap-x-5 gap-y-1.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center">
            <p className="text-[13px] font-semibold text-[#1f2937]">{row.label}<span className="block text-xs font-medium text-[#6b7280] tabular-nums">{row.value} {unit}</span></p>
            <div>
              <div className="h-3 overflow-hidden rounded-full bg-[#f3f4f6]"><span className="block h-full origin-left rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${width(row.value)}%`, background: row.color }} /></div>
              {row.exits && <div className="mt-1.5 flex flex-wrap gap-1.5">{row.exits}</div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Exit({ tone, children }: { tone: 'mute' | 'bad' | 'warn' | 'ok'; children: ReactNode }) {
  const cls = { mute: 'bg-[#f3f4f6] text-[#6b7280]', bad: 'bg-[#fef2f2] text-[#dc2626]', warn: 'bg-[#fffbeb] text-[#b45309]', ok: 'bg-[#ecfdf3] text-[#15803d]' }[tone]
  return <span className={`rounded-md px-2 py-0.5 text-[11.5px] font-semibold ${cls}`}>{children}</span>
}

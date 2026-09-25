import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ClipboardList, Hourglass, MailWarning, Percent } from 'lucide-react'
import type { AdminRegistration, RegistrationState } from '../../../api/contracts/admin'
import { StatStrip, StatTile, panelClass } from '../../staff/StaffUi'
import { REGISTRATION_STATE, REGISTRATION_STATES } from '../admin-status'

/**
 * Overview above the "Tất cả đăng ký" table. Everything here is computed from
 * the same rows the table filters (search + Tour date), so the figures always
 * describe what the Admin is looking at. The state filter is left out on
 * purpose: the donut is how the Admin picks it.
 *
 * Colours are the registration palette already used by `RegistrationBar`.
 */
const STATE_FILL: Record<RegistrationState, string> = {
  Approved: '#2f8f6b',
  Submitted: '#d69412',
  Rejected: '#c9534a',
  Cancelled: '#94a3b8',
}

/** Donut order: the work first, then the outcomes. */
const DONUT_ORDER: RegistrationState[] = ['Submitted', 'Approved', 'Rejected', 'Cancelled']

type Measure = 'groups' | 'students'

type TourRow = {
  id: string
  code: string
  name: string
  total: number
} & Record<RegistrationState, number>

const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function RegistrationInsights({ registrations, loading, activeState, onSelectState }: {
  registrations: AdminRegistration[]
  loading: boolean
  activeState: RegistrationState | 'all'
  onSelectState: (state: RegistrationState | 'all') => void
}) {
  const [measure, setMeasure] = useState<Measure>('groups')
  const animate = !reducedMotion()

  const stats = useMemo(() => {
    const byState = Object.fromEntries(REGISTRATION_STATES.map((s) => [s, 0])) as Record<RegistrationState, number>
    let students = 0
    let waitingStudents = 0
    let mailPending = 0
    let mailFailed = 0
    for (const reg of registrations) {
      byState[reg.state] += 1
      if (reg.state !== 'Cancelled' && reg.state !== 'Rejected') students += reg.studentCount
      if (reg.state === 'Submitted') waitingStudents += reg.studentCount
      if (reg.state === 'Approved') {
        if (reg.invitationFailed) mailFailed += 1
        else if (!reg.invitationSentAt) mailPending += 1
      }
    }
    const decided = byState.Approved + byState.Rejected
    const approvalRate = decided ? Math.round((byState.Approved / decided) * 100) : null
    return { byState, students, waitingStudents, mailPending, mailFailed, approvalRate }
  }, [registrations])

  const tours = useMemo(() => {
    const map = new Map<string, TourRow>()
    for (const reg of registrations) {
      const row = map.get(reg.tourId) ?? { id: reg.tourId, code: reg.tourCode, name: reg.tourName, total: 0, Approved: 0, Submitted: 0, Rejected: 0, Cancelled: 0 }
      const amount = measure === 'groups' ? 1 : reg.studentCount
      row[reg.state] += amount
      row.total += amount
      map.set(reg.tourId, row)
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 8)
  }, [registrations, measure])

  if (loading) {
    return (
      <div className="mb-7 space-y-4" aria-busy="true" aria-label="Đang tải tổng quan đăng ký">
        <div className="h-[92px] animate-pulse rounded-2xl bg-[#f1f5f9] motion-reduce:animate-none" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="h-72 animate-pulse rounded-2xl bg-[#f1f5f9] motion-reduce:animate-none" />
          <div className="h-72 animate-pulse rounded-2xl bg-[#f1f5f9] motion-reduce:animate-none" />
        </div>
      </div>
    )
  }

  const total = registrations.length
  const donut = DONUT_ORDER.map((state) => ({ state, label: REGISTRATION_STATE[state].label, value: stats.byState[state] })).filter((d) => d.value > 0)
  const mailOpen = stats.mailPending + stats.mailFailed

  return (
    <div className="mb-7 space-y-4">
      <StatStrip label="Chỉ số đăng ký" columns="sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={ClipboardList} label="Tổng đăng ký" value={total} hint={`${stats.students} học sinh (trừ từ chối, đã hủy)`} />
        <StatTile icon={Hourglass} label="Chờ duyệt" value={stats.byState.Submitted} tone="warn" hint={stats.byState.Submitted ? `${stats.waitingStudents} học sinh đang chờ quyết định` : 'Không có đoàn nào đang chờ'} />
        <StatTile icon={Percent} label="Tỷ lệ duyệt" value={stats.approvalRate == null ? '-' : `${stats.approvalRate}%`} hint={`${stats.byState.Approved} duyệt, ${stats.byState.Rejected} từ chối`} />
        <StatTile icon={MailWarning} label="Chưa có thông tin tham gia" value={mailOpen} tone={stats.mailFailed ? 'danger' : 'warn'} hint={stats.mailFailed ? `${stats.mailFailed} lần gửi lỗi cần gửi lại` : 'Đoàn đã duyệt nhưng chưa gửi email'} />
      </StatStrip>

      {total > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section className={`${panelClass} p-5`} aria-labelledby="reg-by-state">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="reg-by-state" className="text-[15px] font-semibold tracking-[-0.01em] text-[#0f172a]">Theo trạng thái</h2>
              {activeState !== 'all' && (
                <button type="button" onClick={() => onSelectState('all')} className="text-xs font-semibold text-[#2563eb] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] rounded">Bỏ lọc</button>
              )}
            </div>
            <div className="mt-3 flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
              <div className="relative size-44 shrink-0" role="img" aria-label={`${total} đăng ký: ${donut.map((d) => `${d.value} ${d.label.toLowerCase()}`).join(', ')}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donut}
                      dataKey="value"
                      nameKey="label"
                      innerRadius="68%"
                      outerRadius="100%"
                      paddingAngle={donut.length > 1 ? 2 : 0}
                      cornerRadius={4}
                      stroke="none"
                      isAnimationActive={animate}
                      onClick={(_, index) => { const picked = donut[index]?.state; if (picked) onSelectState(activeState === picked ? 'all' : picked) }}
                      className="cursor-pointer outline-none"
                    >
                      {donut.map((d) => (
                        <Cell key={d.state} fill={STATE_FILL[d.state]} opacity={activeState === 'all' || activeState === d.state ? 1 : 0.28} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
                  <span className="text-[28px] leading-none font-bold tracking-tight text-[#0f172a] tabular-nums">{activeState === 'all' ? total : stats.byState[activeState]}</span>
                  <span className="mt-1 text-xs text-[#64748b]">{activeState === 'all' ? 'đăng ký' : REGISTRATION_STATE[activeState].label.toLowerCase()}</span>
                </div>
              </div>

              <ul className="grid w-full min-w-0 gap-1" aria-label="Lọc theo trạng thái">
                {DONUT_ORDER.map((state) => {
                  const value = stats.byState[state]
                  const selected = activeState === state
                  const share = total ? Math.round((value / total) * 100) : 0
                  return (
                    <li key={state}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onSelectState(selected ? 'all' : state)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${selected ? 'bg-[#f1f5f9]' : 'hover:bg-[#f8fafc]'}`}
                      >
                        <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: STATE_FILL[state] }} aria-hidden="true" />
                        <span className={`flex-1 ${selected ? 'font-semibold text-[#0f172a]' : 'text-[#334155]'}`}>{REGISTRATION_STATE[state].label}</span>
                        <span className="font-semibold text-[#0f172a] tabular-nums">{value}</span>
                        <span className="w-10 text-right text-xs text-[#94a3b8] tabular-nums">{share}%</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </section>

          <section className={`${panelClass} p-5`} aria-labelledby="reg-by-tour">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="reg-by-tour" className="text-[15px] font-semibold tracking-[-0.01em] text-[#0f172a]">Theo Tour</h2>
                <p className="mt-0.5 text-xs text-[#94a3b8]">{tours.length < new Set(registrations.map((r) => r.tourId)).size ? `${tours.length} Tour nhiều đăng ký nhất` : `${tours.length} Tour`}</p>
              </div>
              <div role="group" aria-label="Đơn vị đo" className="inline-flex rounded-lg bg-[#f1f5f9] p-0.5">
                {([['groups', 'Số đoàn'], ['students', 'Học sinh']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={measure === value}
                    onClick={() => setMeasure(value)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${measure === value ? 'bg-white text-[#0f172a] shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-[#64748b] hover:text-[#0f172a]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 w-full" style={{ height: Math.max(160, tours.length * 38 + 36) }} role="img" aria-label={`Đăng ký theo Tour, tính theo ${measure === 'groups' ? 'số đoàn' : 'học sinh'}: ${tours.map((t) => `${t.code} ${t.total}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tours} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barCategoryGap={10}>
                  <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis type="category" dataKey="code" width={84} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#334155', fontWeight: 500 }} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} content={<TourTooltip measure={measure} />} />
                  {DONUT_ORDER.map((state) => (
                    <Bar key={state} dataKey={state} name={REGISTRATION_STATE[state].label} stackId="reg" fill={STATE_FILL[state]} stroke="#fff" strokeWidth={1} isAnimationActive={animate} maxBarSize={22} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function TourTooltip({ active, payload, measure }: { active?: boolean; payload?: ReadonlyArray<{ payload?: TourRow }>; measure: Measure }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  const unit = measure === 'groups' ? 'đoàn' : 'học sinh'
  return (
    <div className="max-w-64 rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-3 text-xs shadow-[0_8px_24px_-8px_rgba(15,23,42,0.18)]">
      <p className="font-semibold text-[#0f172a]">{row.name}</p>
      <p className="mt-0.5 text-[#94a3b8]">{row.code}, tổng {row.total} {unit}</p>
      <ul className="mt-2 grid gap-1">
        {DONUT_ORDER.filter((state) => row[state] > 0).map((state) => (
          <li key={state} className="flex items-center gap-2 text-[#334155]">
            <span className="size-2 rounded-[2px]" style={{ background: STATE_FILL[state] }} aria-hidden="true" />
            <span className="flex-1">{REGISTRATION_STATE[state].label}</span>
            <span className="font-semibold tabular-nums">{row[state]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

import { BatteryCharging, Bot, CheckCircle2, Users } from 'lucide-react'
import type { AmrStatus, TourOperation } from '../../../api/contracts/staff'
import { groupSummary, routeProgress } from '../attention'

const cardClass =
  'rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-xs transition-[border-color,box-shadow] duration-200 hover:border-[#cbd5e1] hover:shadow-sm'

export function OverviewAnalytics({ tours, robots }: { tours: TourOperation[]; robots: AmrStatus[] }) {
  const visibleTours = tours.filter((tour) => tour.state !== 'Cancelled' || tour.startedAt)
  const attendance = visibleTours.map((tour) => ({ code: tour.code, students: groupSummary(tour).students }))
  const totalStudents = attendance.reduce((sum, item) => sum + item.students, 0)
  const maxStudents = Math.max(1, ...attendance.map((item) => item.students))
  const measuredRobots = robots.filter((robot) => robot.batteryPercent != null)
  const running = tours.find((tour) => tour.state === 'Running')
  const progress = running ? routeProgress(running) : null
  const progressPercent = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : null
  // Only robots that can serve a Tour count towards readiness; Gazebo / emulator units never do.
  const fleet = robots.filter((robot) => robot.assignable !== false)
  const healthy = fleet.filter(
    (robot) => robot.connectionState === 'Live' && robot.localized !== false && !robot.headFault && !robot.needsCheck,
  ).length
  const reliability = fleet.length ? Math.round((healthy / fleet.length) * 100) : null

  return (
    <section className="mt-6" aria-labelledby="overview-analytics-title">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 id="overview-analytics-title" className="text-base font-semibold tracking-[-0.01em] text-[#0f172a]">
            Học sinh, pin và độ sẵn sàng
          </h2>
        </div>
        <span className="rounded-md bg-[#f8fafc] px-2.5 py-1 text-[11px] font-semibold text-[#64748b] border border-[#e2e8f0]">
          Thời gian thực
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Card 1: Attendance Flow */}
        <article className={cardClass} aria-label="Lưu lượng tham quan hôm nay">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#0f172a]">Lưu lượng tham quan hôm nay</h3>
              <p className="mt-1 text-xs text-[#64748b]">
                {totalStudents} học sinh · {visibleTours.length} buổi có hoạt động
              </p>
            </div>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
              <Users size={17} aria-hidden="true" />
            </span>
          </div>
          {attendance.length ? (
            <div
              className="mt-5 flex h-32 items-end gap-2 border-b border-[#f1f5f9] px-1"
              role="img"
              aria-label={attendance.map((item) => `${item.code}: ${item.students} học sinh`).join(', ')}
            >
              {attendance.map((item, index) => (
                <div key={item.code} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                  <span className="mb-1 text-[10px] font-bold text-[#64748b] tabular-nums">{item.students}</span>
                  <span
                    className={`mx-auto block w-full max-w-8 rounded-t-md transition-all duration-300 ${
                      index === attendance.length - 1 ? 'bg-[#3b82f6]' : 'bg-[#cbd5e1]'
                    }`}
                    style={{ height: `${Math.max(12, (item.students / maxStudents) * 82)}%` }}
                  />
                  <span className="mt-2 text-[10px] font-medium text-[#64748b] truncate">{item.code}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-8 py-8 text-center text-xs text-[#94a3b8]">Chưa có dữ liệu buổi hôm nay.</p>
          )}
        </article>

        {/* Card 2: Battery and Progress */}
        <article className={cardClass} aria-label="Pin và tiến độ vận hành">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#0f172a]">Pin & Tiến độ vận hành</h3>
              <p className="mt-1 text-xs text-[#64748b]">Số đo mới nhất từ robot và phiên đang chạy</p>
            </div>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
              <BatteryCharging size={17} aria-hidden="true" />
            </span>
          </div>
          <div className="mt-6 space-y-4">
            {measuredRobots.map((robot) => (
              <MetricBar
                key={robot.id}
                label={`Pin ${robot.name}`}
                value={robot.batteryPercent ?? 0}
                color={(robot.batteryPercent ?? 100) < 30 ? 'bg-[#ef4444]' : 'bg-[#10b981]'}
              />
            ))}
            {progressPercent != null && (
              <MetricBar
                label={`Tiến độ ${running?.code ?? ''}`}
                value={progressPercent}
                color="bg-[#2563eb]"
              />
            )}
            {measuredRobots.length === 0 && progressPercent == null && (
              <p className="py-8 text-center text-xs text-[#94a3b8]">Chưa có số đo để hiển thị.</p>
            )}
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-[#f1f5f9] pt-3 text-[11px] text-[#64748b]">
            <span>Mức pin còn lại</span>
            <span className="font-semibold text-[#0f172a]">
              {progress ? `${progress.done}/${progress.total} POI hoàn tất` : 'Không có phiên đang chạy'}
            </span>
          </div>
        </article>

        {/* Card 3: Fleet Reliability */}
        <article className={cardClass} aria-label="Độ tin cậy đội robot">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#0f172a]">Độ tin cậy & Trạng thái đội</h3>
              <p className="mt-1 text-xs text-[#64748b]">Kết nối, định vị và tình trạng thiết bị</p>
            </div>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
              <Bot size={17} aria-hidden="true" />
            </span>
          </div>
          <div className="mt-5 flex items-center gap-6">
            <div
              className="relative grid size-28 shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(#10b981 0 ${reliability ?? 0}%, #f59e0b ${reliability ?? 0}% 100%)`,
              }}
              role="meter"
              aria-label="Tỷ lệ robot sẵn sàng"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={reliability ?? undefined}
            >
              <div className="grid size-20 place-items-center rounded-full bg-white text-center shadow-xs">
                <span>
                  <strong className="block text-2xl font-black text-[#0f172a] leading-none tabular-nums">
                    {reliability == null ? '-' : `${reliability}%`}
                  </strong>
                  <small className="mt-1 block text-[9px] font-bold text-[#64748b] uppercase tracking-wider">
                    Sẵn sàng
                  </small>
                </span>
              </div>
            </div>
            <dl className="min-w-0 flex-1 space-y-2.5 text-xs">
              <LegendRow color="bg-[#10b981]" label="Sẵn sàng" value={healthy} />
              <LegendRow color="bg-[#f59e0b]" label="Cần kiểm tra" value={Math.max(0, fleet.length - healthy)} />
              <LegendRow
                color="bg-[#ef4444]"
                label="Cần hỗ trợ"
                value={tours.filter((tour) => tour.operationalStatus === 'NeedsAssistance').length}
              />
            </dl>
          </div>
          <p className="mt-5 flex items-center gap-1.5 border-t border-[#f1f5f9] pt-3 text-[11px] font-semibold text-[#10b981]">
            <CheckCircle2 size={14} aria-hidden="true" />
            Dữ liệu lấy trực tiếp từ hệ thống
          </p>
        </article>
      </div>
    </section>
  )
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  const safeValue = Math.max(0, Math.min(100, value))
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="truncate font-semibold text-[#334155]">{label}</span>
        <strong className="text-[#0f172a] tabular-nums font-bold">{safeValue}%</strong>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-[#f1f5f9]"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safeValue}
      >
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  )
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`size-2 shrink-0 rounded-full ${color}`} />
      <dt className="min-w-0 flex-1 truncate text-[#64748b]">{label}</dt>
      <dd className="font-bold text-[#0f172a] tabular-nums">{value}</dd>
    </div>
  )
}

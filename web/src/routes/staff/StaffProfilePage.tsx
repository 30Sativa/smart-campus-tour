import type { ReactNode } from 'react'
import { Check, ChevronRight, Info, LogOut, Minus } from 'lucide-react'
import { Link } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { isStaffRole, roleLabel } from '../../auth/roles'
import { PageHeader, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { StaffPage } from '../../features/staff/StaffUi'
import { useTours } from '../../features/staff/staff-hooks'
import { routeProgress, tourAction } from '../../features/staff/attention'
import { formatCountdown, formatTime } from '../../features/staff/formatters'
import { useNow } from '../../features/staff/use-now'
import { byStart } from '../../features/staff/today-board'

/** What an operator account may do, and what stays with Admin (scope: roles, ADR-0012/0013). */
const CAN = [
  'Kiểm tra thiết bị và bắt đầu buổi Sẵn sàng',
  'Giữ tại POI, đi tiếp, kết thúc sớm có lý do',
  'Xử lý yêu cầu đổi nhánh từ đại diện',
  'Xác nhận robot sẵn sàng sau kiểm tra tại chỗ',
]
const ADMIN_ONLY = ['Tạo lịch và chốt buổi', 'Duyệt đăng ký, gửi lời mời', 'Quản lý tài khoản, tuyến và POI']

function initialsOf(name: string) {
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  return (parts.length > 1 ? parts.slice(-2).map((part) => part[0]).join('') : name.slice(0, 2)).toUpperCase()
}

function Card({ title, note, action, children }: { title: string; note?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={panelClass} aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-[#0f172a]">{title}</h2>
          {note && <p className="mt-0.5 text-[12.5px] text-[#64748b]">{note}</p>}
        </div>
        {action}
      </div>
      <div className="px-5 pt-3.5 pb-5">{children}</div>
    </section>
  )
}

/**
 * The signed-in operator's own page: who the account is, what the role may
 * do, and today's shift at a glance. It only reads: accounts are issued and
 * changed by Admin, so there is no self-service edit or password form here.
 */
export default function StaffProfilePage() {
  const user = useAuthStore((state) => state.user)
  const logout = useLogout()
  const tours = useTours()
  const now = useNow(30_000)
  const name = user?.username || 'Nhân viên vận hành'

  const today = [...(tours.data ?? [])].sort(byStart)
  const running = today.find((tour) => tour.state === 'Running')
  const next = today.find((tour) => (tour.state === 'Ready' || tour.state === 'Scheduled') && new Date(tour.scheduledAt).getTime() >= now)
  const finished = today.filter((tour) => tour.state === 'Completed' || tour.state === 'Cancelled').length
  const progress = running ? routeProgress(running) : null

  return (
    <StaffPage>
      <PageHeader eyebrow="Tài khoản" title="Hồ sơ của tôi" description="Tài khoản vận hành, quyền của vai trò và ca hôm nay." />

      <section className={`${panelClass} relative flex flex-wrap items-center gap-x-6 gap-y-4 p-6 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[#2563eb]`} aria-label="Thông tin chính">
        <span aria-hidden="true" className="grid size-[68px] shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#2d719e,#2563eb)] text-[22px] font-extrabold text-white shadow-[0_0_0_5px_#eff6ff]">
          {initialsOf(name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[22px] font-extrabold tracking-tight text-[#0f172a]">{name}</h2>
          <p className="mt-0.5 text-[13.5px] text-[#64748b]">{roleLabel(user?.role)}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf3] px-2.5 py-0.5 text-xs font-bold text-[#15803d]">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
              Đang đăng nhập
            </span>
            {isStaffRole(user?.role) && <span className="rounded-full bg-[#f1f5f9] px-2.5 py-0.5 text-xs font-bold text-[#334155]">Vận hành mọi buổi</span>}
          </div>
        </div>
        <dl className="flex flex-wrap gap-2.5">
          <div className="min-w-[132px] rounded-xl border border-[#eef0f3] px-3.5 py-2.5">
            <dt className="text-[10.5px] font-bold tracking-[0.06em] text-[#94a3b8] uppercase">Đang chạy</dt>
            <dd className="mt-0.5 text-lg font-extrabold text-[#0f172a]">
              {running ? (
                <>
                  {running.code}
                  {progress && <span className="ml-1.5 text-xs font-medium text-[#64748b]">POI {Math.min(progress.done + 1, progress.total)}/{progress.total}</span>}
                </>
              ) : (
                <span className="text-sm font-semibold text-[#94a3b8]">Không có</span>
              )}
            </dd>
          </div>
          <div className="min-w-[132px] rounded-xl border border-[#eef0f3] px-3.5 py-2.5">
            <dt className="text-[10.5px] font-bold tracking-[0.06em] text-[#94a3b8] uppercase">Hôm nay</dt>
            <dd className="mt-0.5 text-lg font-extrabold text-[#0f172a]">
              {tours.data ? today.length : '–'}
              <span className="ml-1.5 text-xs font-medium text-[#64748b]">buổi · {finished} đã xong</span>
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid gap-5">
          <Card
            title="Ca hôm nay"
            note="Buổi đang chạy và buổi kế tiếp của cả đội vận hành."
            action={<Link to="/staff/tours" className={buttonClass('secondary', 'sm')}>Buổi hôm nay<ChevronRight size={14} aria-hidden="true" /></Link>}
          >
            {tours.isPending ? (
              <p className="text-sm text-[#94a3b8]">Đang tải…</p>
            ) : tours.isError ? (
              <p className="text-sm text-[#b91c1c]">Không tải được danh sách buổi hôm nay.</p>
            ) : running || next ? (
              <ul className="divide-y divide-[#f1f4f8]">
                {[running && { tour: running, label: 'Đang chạy', hint: running.startedAt ? `bắt đầu ${formatTime(running.startedAt)}` : '' }, next && { tour: next, label: 'Kế tiếp', hint: formatCountdown(next.scheduledAt, now) ?? 'đã tới giờ' }]
                  .filter((row): row is { tour: NonNullable<typeof running>; label: string; hint: string } => Boolean(row))
                  .map(({ tour, label, hint }) => {
                    const action = tourAction(tour)
                    return (
                      <li key={tour.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                        <span className="w-20 shrink-0">
                          <span className="block text-[10.5px] font-bold tracking-[0.06em] text-[#94a3b8] uppercase">{label}</span>
                          <span className="block text-[15px] font-extrabold text-[#0f172a] tabular-nums">{formatTime(tour.scheduledAt)}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-[#0f172a]">
                            <span className="mr-1.5 font-mono text-xs text-[#2563eb]">{tour.code}</span>
                            {tour.name}
                          </span>
                          <span className="block truncate text-xs text-[#64748b]">{tour.routeName}{hint ? ` · ${hint}` : ''}</span>
                        </span>
                        <Link to={action.to} className={buttonClass(action.kind === 'primary' || tour.state === 'Running' ? 'primary' : 'secondary', 'sm')}>{action.label}</Link>
                      </li>
                    )
                  })}
              </ul>
            ) : (
              <p className="text-sm text-[#64748b]">Không còn buổi nào đang chạy hoặc sắp tới hôm nay.</p>
            )}
          </Card>

          {isStaffRole(user?.role) && (
            <Card title="Quyền của vai trò Staff" note="Mọi Staff đang hoạt động vận hành được mọi buổi; không phân công theo buổi.">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-extrabold tracking-[0.05em] text-[#15803d] uppercase">Được làm</h3>
                  <ul className="grid gap-2 text-[13px] text-[#0f172a]">
                    {CAN.map((item) => (
                      <li key={item} className="flex items-start gap-2 leading-snug"><Check size={15} strokeWidth={3} aria-hidden="true" className="mt-0.5 shrink-0 text-[#16a34a]" />{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-extrabold tracking-[0.05em] text-[#64748b] uppercase">Thuộc Admin</h3>
                  <ul className="grid gap-2 text-[13px] text-[#64748b]">
                    {ADMIN_ONLY.map((item) => (
                      <li key={item} className="flex items-start gap-2 leading-snug"><Minus size={15} strokeWidth={2.6} aria-hidden="true" className="mt-0.5 shrink-0 text-[#94a3b8]" />{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="grid gap-5">
          <Card title="Tài khoản" note="Do Admin cấp; mỗi tài khoản một vai trò.">
            <dl className="grid">
              {[
                ['Tên đăng nhập', <span key="u" className="font-mono">{user?.username ?? '–'}</span>],
                ['Vai trò', roleLabel(user?.role)],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between gap-4 border-t border-[#f1f4f8] py-2.5 text-[13.5px] first:border-t-0 first:pt-0">
                  <dt className="text-[#64748b]">{label}</dt>
                  <dd className="text-right font-bold text-[#0f172a]">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 flex gap-2 rounded-xl bg-[#f8fafc] px-3 py-2.5 text-xs leading-relaxed text-[#64748b]">
              <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-[#94a3b8]" />
              Cần đổi mật khẩu, họ tên hoặc khóa tài khoản? Liên hệ Admin: tài khoản được cấp và thay đổi tại khu vực quản trị.
            </p>
          </Card>

          <button type="button" onClick={() => void logout()} className={`${buttonClass('danger', 'md')} w-full`}>
            <LogOut size={16} aria-hidden="true" />
            Đăng xuất
          </button>
        </div>
      </div>
    </StaffPage>
  )
}

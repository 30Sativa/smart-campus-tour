import type { ReactNode } from 'react'
import { Check, ChevronRight, Info, LogOut, Minus } from 'lucide-react'
import { Link } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { isStaffRole, roleLabel } from '../../auth/roles'
import { PageHeader, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { StaffPage } from '../../features/staff/StaffUi'
import { AccountSettings } from '../../features/account/AccountSettings'
import { campusDay, campusTime } from '../../features/administration/tours/tour-calendar'
import { formatCountdown } from '../../features/staff/formatters'
import { useNow } from '../../features/staff/use-now'
import { useDayTours } from '../../features/staff/operations/hooks'
import { nextStep } from '../../features/staff/operations/next-step'

/** What a Staff account may do, and what belongs to another role (ADR-0020, ADR-0042 §6). */
const CAN = [
  'Chuẩn bị Tour: POI, tuyến, duyệt đăng ký, tạo Tour',
  'Chốt Tour (READY) và mở lại khi chưa bắt đầu',
  'Kiểm tra điều kiện và bắt đầu Tour mình được giao vận hành',
  'Đi tiếp tại POI của Tour mình được giao vận hành',
]
const ADMIN_ONLY = ['Tài khoản, vai trò và nhật ký hệ thống (Admin)', 'Bản đồ, robot và kiểm chứng tuyến (Kỹ thuật)']

function initialsOf(name: string) {
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  return (parts.length > 1 ? parts.slice(-2).map((part) => part[0]).join('') : name.slice(0, 2)).toUpperCase()
}

function Card({ title, note, action, children }: { title: string; note?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={panelClass} aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-3.5 pt-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-[#0f172a]">{title}</h2>
          {note && <p className="mt-0.5 text-[12.5px] text-[#64748b]">{note}</p>}
        </div>
        {action}
      </div>
      <div className="px-3.5 pt-3.5 pb-5">{children}</div>
    </section>
  )
}

/**
 * The signed-in operator's own page: who the account is, what the role may
 * do, and today's shift at a glance. Name and password are self-service
 * (AccountSettings); role and status stay with Admin.
 */
export default function StaffProfilePage() {
  const user = useAuthStore((state) => state.user)
  const logout = useLogout()
  const tours = useDayTours(campusDay(new Date()))
  const now = useNow(30_000)
  const name = user?.username || 'Nhân viên vận hành'

  const today = tours.data?.data ?? []
  const running = today.find((tour) => tour.state === 'RUNNING')
  const next = today.find((tour) => (tour.state === 'READY' || tour.state === 'SCHEDULED') && new Date(tour.scheduledStartAt).getTime() >= now)
  const finished = today.filter((tour) => tour.state === 'COMPLETED' || tour.state === 'CANCELLED').length

  return (
    <StaffPage>
      <PageHeader eyebrow="Tài khoản" title="Hồ sơ của tôi" description="Tài khoản vận hành, quyền của vai trò và ca hôm nay." />

      <section className={`${panelClass} relative flex flex-wrap items-center gap-x-6 gap-y-4 p-4 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[#2563eb]`} aria-label="Thông tin chính">
        <span aria-hidden="true" className="grid size-[68px] shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#2d719e,#2563eb)] text-[20px] font-bold text-white shadow-[0_0_0_5px_#eff6ff]">
          {initialsOf(name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[20px] font-bold tracking-tight text-[#0f172a]">{name}</h2>
          <p className="mt-0.5 text-[13.5px] text-[#64748b]">{roleLabel(user?.role)}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf3] px-2.5 py-0.5 text-xs font-bold text-[#15803d]">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
              Đang đăng nhập
            </span>
          </div>
        </div>
        <dl className="flex flex-wrap gap-2.5">
          <div className="min-w-[132px] rounded-xl border border-[#eef0f3] px-3.5 py-2.5">
            <dt className="text-[11.5px] font-medium text-[#94a3b8]">Đang chạy</dt>
            <dd className="mt-0.5 text-lg font-bold text-[#0f172a]">
              {running ? (
                <span className="block max-w-48 truncate text-sm">{running.name}</span>
              ) : (
                <span className="text-sm font-semibold text-[#94a3b8]">Không có</span>
              )}
            </dd>
          </div>
          <div className="min-w-[132px] rounded-xl border border-[#eef0f3] px-3.5 py-2.5">
            <dt className="text-[11.5px] font-medium text-[#94a3b8]">Hôm nay</dt>
            <dd className="mt-0.5 text-lg font-bold text-[#0f172a]">
              {tours.data ? today.length : '–'}
              <span className="ml-1.5 text-xs font-medium text-[#64748b]">Tour · {finished} đã xong</span>
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid gap-3">
          <Card
            title="Ca hôm nay"
            note="Tour đang chạy và Tour kế tiếp hôm nay của cả đội."
            action={<Link to="/staff/tours" className={buttonClass('secondary', 'sm')}>Buổi hôm nay<ChevronRight size={14} aria-hidden="true" /></Link>}
          >
            {tours.isPending ? (
              <p className="text-sm text-[#94a3b8]">Đang tải…</p>
            ) : tours.isError ? (
              <p className="text-sm text-[#b91c1c]">Không tải được danh sách buổi hôm nay.</p>
            ) : running || next ? (
              <ul className="divide-y divide-[#f1f4f8]">
                {[running && { tour: running, label: 'Đang chạy', hint: '' }, next && { tour: next, label: 'Kế tiếp', hint: formatCountdown(next.scheduledStartAt, now) ?? 'đã tới giờ' }]
                  .filter((row): row is { tour: NonNullable<typeof running>; label: string; hint: string } => Boolean(row))
                  .map(({ tour, label, hint }) => {
                    const action = nextStep(tour)
                    return (
                      <li key={tour.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                        <span className="w-20 shrink-0">
                          <span className="block text-[11.5px] font-medium text-[#94a3b8]">{label}</span>
                          <span className="block text-[15px] font-bold text-[#0f172a] tabular-nums">{campusTime(tour.scheduledStartAt)}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-[#0f172a]">{tour.name}</span>
                          <span className="block truncate text-xs text-[#64748b]">{tour.routeName}{hint ? ` · ${hint}` : ''}</span>
                        </span>
                        <Link to={action.to} className={buttonClass(tour.state === 'RUNNING' || tour.state === 'READY' ? 'primary' : 'secondary', 'sm')}>{action.label}</Link>
                      </li>
                    )
                  })}
              </ul>
            ) : (
              <p className="text-sm text-[#64748b]">Không còn Tour nào đang chạy hoặc sắp tới hôm nay.</p>
            )}
          </Card>

          {isStaffRole(user?.role) && (
            <Card title="Quyền của vai trò Staff" note="Bắt đầu và đi tiếp chỉ dành cho người vận hành được giao cho từng Tour.">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-[#15803d]">Được làm</h3>
                  <ul className="grid gap-2 text-[13px] text-[#0f172a]">
                    {CAN.map((item) => (
                      <li key={item} className="flex items-start gap-2 leading-snug"><Check size={15} strokeWidth={3} aria-hidden="true" className="mt-0.5 shrink-0 text-[#16a34a]" />{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-[#64748b]">Thuộc vai trò khác</h3>
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

        <div className="grid gap-3">
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
              Bạn tự sửa họ tên và đổi mật khẩu bên dưới. Khóa tài khoản hoặc đổi vai trò do Admin thực hiện.
            </p>
          </Card>

          <AccountSettings />

          <button type="button" onClick={() => void logout()} className={`${buttonClass('danger', 'md')} w-full`}>
            <LogOut size={16} aria-hidden="true" />
            Đăng xuất
          </button>
        </div>
      </div>
    </StaffPage>
  )
}

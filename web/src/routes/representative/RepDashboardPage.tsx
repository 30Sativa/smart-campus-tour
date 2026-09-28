import { CalendarDays } from 'lucide-react'
import { Link } from 'react-router'
import { buttonClass } from '../../features/staff/ui-classes'
import { EmptyState, ErrorState, Panel, RegistrationStatusBadge, RepPage, RepPageHeader, Skeleton } from '../../features/representative/components/RepUi'
import { TourCard } from '../../features/representative/components/TourCard'
import { useRepRegistrations, useRepTours } from '../../features/representative/representative-hooks'
import { panelBase } from '../../features/representative/rep-classes'
import { formatRelative, lastActivity, readRepError } from '../../features/representative/rep-format'
import { currentRepresentativeProfile } from '../../mocks/representative-mock'

/**
 * Representative overview: where the school's registrations stand, the next
 * Tours open for registration, and what changed recently. Deliberately small:
 * no charts, one primary action.
 */
export default function RepDashboardPage() {
  const tours = useRepTours()
  const regs = useRepRegistrations()
  const profile = currentRepresentativeProfile()

  const list = regs.data ?? []
  const count = (state: string) => list.filter((r) => r.state === state).length
  const open = (tours.data ?? []).filter((t) => t.register.allowed).slice(0, 3)
  const recent = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)
  const toFix = list.filter((r) => r.state === 'Rejected' && r.allowedActions.edit.allowed)

  const stats = [
    { label: 'Tổng đăng ký', value: list.length, to: '/dai-dien/dang-ky' },
    { label: 'Chờ duyệt', value: count('Submitted'), to: '/dai-dien/dang-ky?trang-thai=cho-duyet' },
    { label: 'Đã duyệt', value: count('Approved'), to: '/dai-dien/dang-ky?trang-thai=da-duyet' },
    { label: 'Từ chối', value: count('Rejected'), to: '/dai-dien/dang-ky?trang-thai=tu-choi' },
  ]

  return (
    <RepPage>
      <RepPageHeader
        title={profile.representativeName ? `Xin chào, ${profile.representativeName}` : 'Tổng quan'}
        description={profile.schoolName ? `Theo dõi đăng ký tham quan từ xa của ${profile.schoolName}.` : 'Theo dõi các đăng ký tham quan từ xa của trường.'}
        action={<Link to="/dai-dien/buoi" className={buttonClass('primary', 'lg')}>Xem buổi tham quan</Link>}
      />

      <section aria-label="Số liệu đăng ký" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className={`${panelBase} block px-5 py-4 transition-colors hover:border-[#cfd8e3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]`}>
            <span className="block text-sm text-[#64748b]">{s.label}</span>
            {regs.isLoading ? <Skeleton className="mt-2 h-8 w-12" /> : <span className="mt-1 block text-[30px] leading-tight font-bold tracking-tight text-[#0f172a] tabular-nums">{regs.isError ? '-' : s.value}</span>}
          </Link>
        ))}
      </section>

      {toFix.length > 0 && (
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#f5c8c2] bg-[#fff5f3] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[15px] text-[#0f172a]"><b>{toFix.length} đăng ký bị từ chối</b> <span className="text-[#475569]">cần sửa và gửi lại trước khi buổi được chốt.</span></p>
          <Link to={`/dai-dien/dang-ky/${toFix[0].id}`} className={`${buttonClass('secondary', 'sm')} shrink-0`}>Xem lý do từ chối</Link>
        </div>
      )}

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="open-tours">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="open-tours" className="text-lg font-semibold tracking-[-0.01em] text-[#0f172a]">Buổi đang nhận đăng ký</h2>
            <Link to="/dai-dien/buoi" className={buttonClass('ghost', 'sm')}>Tất cả buổi</Link>
          </div>
          {tours.isLoading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Đang tải buổi tham quan">
              {[0, 1].map((i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
            </div>
          ) : tours.isError ? (
            <ErrorState title="Không tải được buổi tham quan" message={readRepError(tours.error).message} onRetry={() => void tours.refetch()} />
          ) : open.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Chưa có buổi nào đang nhận đăng ký" description="Buổi mới do Admin mở sẽ xuất hiện ở đây. Bạn vẫn xem được các đăng ký đã gửi." />
          ) : (
            <div className="space-y-3">{open.map((t) => <TourCard key={t.id} tour={t} compact />)}</div>
          )}
        </section>

        <Panel title="Hoạt động gần đây" action={<Link to="/dai-dien/dang-ky" className={buttonClass('ghost', 'sm')}>Đăng ký của tôi</Link>}>
          {regs.isLoading ? (
            <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : regs.isError ? (
            <p className="text-sm text-[#b23e31]" role="alert">{readRepError(regs.error).message}</p>
          ) : recent.length === 0 ? (
            <p className="py-4 text-sm leading-relaxed text-[#64748b]">Chưa có hoạt động. Chọn một buổi đang nhận đăng ký để gửi đăng ký đầu tiên.</p>
          ) : (
            <ol className="space-y-1">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link to={`/dai-dien/dang-ky/${r.id}`} className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#0f172a]">{lastActivity(r)}</p>
                      <p className="mt-0.5 truncate text-[13px] text-[#64748b]">{r.tourName}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <RegistrationStatusBadge state={r.state} />
                      <span className="text-xs text-[#94a3b8]">{formatRelative(r.updatedAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </RepPage>
  )
}

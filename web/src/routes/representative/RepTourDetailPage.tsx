import { Link, useParams } from 'react-router'
import type { RepresentativeTour } from '../../api/contracts/representative'
import { buttonClass } from '../../features/staff/ui-classes'
import { Callout, ErrorState, InfoList, PageSkeleton, Panel, RegistrationStatusBadge, RepPage, RepPageHeader, TourStateBadge } from '../../features/representative/components/RepUi'
import { useRepTour } from '../../features/representative/representative-hooks'
import { formatDate, formatTime, readRepError } from '../../features/representative/rep-format'

const INSTRUCTIONS = [
  'Đăng ký, sửa, thay danh sách hoặc hủy chỉ làm được khi buổi còn đang nhận đăng ký. Khi Admin chốt danh sách, đăng ký chỉ còn để xem.',
  'Danh sách học sinh là file Excel có cột HoTen (bắt buộc) và Lop (không bắt buộc). Mỗi lần tải file mới sẽ thay toàn bộ danh sách cũ.',
  'Admin duyệt từng đăng ký. Sau khi duyệt, bạn nhận đường dẫn và mã đoàn để chia sẻ cho học sinh.',
  'Học sinh không cần tài khoản: các em vào bằng đường dẫn, mã đoàn, họ tên và lớp.',
]

/** Where this Tour stands for this account, and the one action that fits. */
function RegistrationBox({ tour: t }: { tour: RepresentativeTour }) {
  const hasActive = Boolean(t.myRegistrationId) && t.myRegistrationState !== 'Cancelled'
  if (hasActive) {
    return (
      <>
        <p className="text-sm leading-relaxed text-[#475569]">Bạn đã có đăng ký cho buổi này. Mỗi đại diện có một đăng ký cho một buổi; mọi thay đổi làm trong đăng ký đó.</p>
        <Link to={`/dai-dien/dang-ky/${t.myRegistrationId}`} className={`${buttonClass('primary', 'lg')} mt-4 w-full max-lg:hidden`}>Xem đăng ký</Link>
      </>
    )
  }
  if (t.register.allowed) {
    return (
      <>
        <p className="text-sm leading-relaxed text-[#475569]">
          {t.myRegistrationState === 'Cancelled'
            ? 'Đăng ký trước của bạn đã hủy. Đăng ký lại dùng chính bản ghi đó và chờ Admin duyệt lại.'
            : 'Chuẩn bị file Excel danh sách học sinh. Bạn có thể tải file mẫu ở bước 2.'}
        </p>
        <Link to={`/dai-dien/buoi/${t.id}/dang-ky`} className={`${buttonClass('primary', 'lg')} mt-4 w-full max-lg:hidden`}>{t.myRegistrationState === 'Cancelled' ? 'Đăng ký lại' : 'Đăng ký đoàn'}</Link>
      </>
    )
  }
  return (
    <>
      <button type="button" disabled className={`${buttonClass('primary', 'lg')} w-full`} aria-describedby="register-why">Đăng ký đoàn</button>
      <p id="register-why" className="mt-2 text-[13px] leading-snug text-[#64748b]">{t.register.reason ?? 'Buổi không nhận đăng ký mới.'}</p>
    </>
  )
}

/** Tour Detail (flow review §4.1): enough to decide, then register or the reason why not. */
export default function RepTourDetailPage() {
  const { tourId = '' } = useParams()
  const tour = useRepTour(tourId)

  if (tour.isLoading) return <PageSkeleton label="Đang tải buổi tham quan" />
  if (tour.isError || !tour.data) {
    return (
      <RepPage>
        <ErrorState title="Không mở được buổi này" message={readRepError(tour.error).message} back={{ to: '/dai-dien/buoi', label: 'Về danh sách buổi' }} />
      </RepPage>
    )
  }

  const t = tour.data
  const hasActive = Boolean(t.myRegistrationId) && t.myRegistrationState !== 'Cancelled'
  const mobileCta = hasActive
    ? { to: `/dai-dien/dang-ky/${t.myRegistrationId}`, label: 'Xem đăng ký' }
    : t.register.allowed ? { to: `/dai-dien/buoi/${t.id}/dang-ky`, label: t.myRegistrationState === 'Cancelled' ? 'Đăng ký lại' : 'Đăng ký đoàn' } : null

  return (
    <RepPage>
      <RepPageHeader
        back={{ to: '/dai-dien/buoi', label: 'Buổi tham quan' }}
        badges={<><TourStateBadge state={t.state} size="md" />{t.myRegistrationState && <RegistrationStatusBadge state={t.myRegistrationState} size="md" />}</>}
        title={t.name}
        description={`Mã buổi ${t.code}. Tham quan khuôn viên từ xa qua robot tự hành và một livestream chung.`}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Thông tin buổi">
            <InfoList items={[
              { label: 'Ngày', value: formatDate(t.scheduledAt) },
              { label: 'Giờ bắt đầu dự kiến', value: formatTime(t.scheduledAt) },
              { label: 'Tuyến tham quan', value: t.routeName },
              { label: 'Số điểm tham quan', value: `${t.stops.length} điểm` },
            ]} />
            {t.description && <p className="mt-5 border-t border-[#eef1f5] pt-5 text-[15px] leading-relaxed text-[#334155]">{t.description}</p>}
          </Panel>

          <Panel title="Lộ trình" action={<span className="text-sm text-[#64748b]">{t.stops.length} điểm, theo thứ tự</span>}>
            <ol className="relative space-y-4 pl-0">
              {t.stops.map((stop, i) => (
                <li key={`${stop}-${i}`} className="relative flex items-center gap-3.5">
                  {i < t.stops.length - 1 && <span aria-hidden="true" className="absolute top-8 left-[15px] h-[calc(100%-8px)] w-px bg-[#e2e8f0]" />}
                  <span className="relative grid size-8 shrink-0 place-items-center rounded-full border border-[#d6e4fb] bg-[#f5f9ff] text-[13px] font-semibold text-[#2563eb] tabular-nums">{i + 1}</span>
                  <span className="text-[15px] font-medium text-[#0f172a]">{stop}</span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Lưu ý quan trọng">
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-[#475569] marker:text-[#94a3b8]">
              {INSTRUCTIONS.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Panel title="Đăng ký của đoàn bạn">
            <RegistrationBox tour={t} />
          </Panel>
          {t.state !== 'Scheduled' && (
            <Callout tone="muted" title="Chỉ xem">Buổi này không còn nhận thay đổi. Liên hệ Admin nếu cần hỗ trợ.</Callout>
          )}
        </aside>
      </div>

      {mobileCta && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#e5e9f0] bg-white/95 px-4 py-3 backdrop-blur-md lg:hidden">
          <Link to={mobileCta.to} className={`${buttonClass('primary', 'lg')} w-full`}>{mobileCta.label}</Link>
        </div>
      )}
    </RepPage>
  )
}

import { ArrowLeft, Info } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Loading, Pill, RegistrationChip, TourChip } from '../../features/representative/components/RepUi'
import { useRepTour } from '../../features/representative/representative-hooks'
import { formatDateTime, readRepError } from '../../features/representative/rep-format'

/** Tour Detail (flow review §4.1): enough to decide, then Register or the reason why not. */
export default function RepTourDetailPage() {
  const { tourId = '' } = useParams()
  const tour = useRepTour(tourId)

  if (tour.isLoading) return <div className="rp-ctn"><Loading /></div>
  if (tour.isError || !tour.data) {
    return (
      <div className="rp-ctn rp-section">
        <div className="rp-callout rp-callout--danger" role="alert">
          <div>
            <b>Không mở được buổi này</b>
            <p>{readRepError(tour.error).message}</p>
            <div className="rp-callout__actions"><Link to="/dai-dien" className="rp-chip-btn">Về danh sách buổi</Link></div>
          </div>
        </div>
      </div>
    )
  }

  const t = tour.data
  const hasActive = t.myRegistrationId && t.myRegistrationState !== 'Cancelled'

  return (
    <div className="rp-ctn">
      <section className="rp-band">
        <img src="/images/login-bg.jpg" alt="" aria-hidden="true" />
        <div className="rp-band__top">
          <Link to="/dai-dien" className="rp-back"><ArrowLeft size={14} />Tất cả buổi tham quan</Link>
          <TourChip state={t.state} />
        </div>
        <div>
          <span className="rp-kicker">{t.code} · Tham quan từ xa</span>
          <h1 style={{ marginTop: 12 }}>{t.name}</h1>
        </div>
        <div className="rp-band__meta">
          <div><b>{formatDateTime(t.scheduledAt)}</b>Giờ dự kiến</div>
          <div><b>{t.stops.length} điểm</b>{t.routeName}</div>
          <div><b>≈ 30 phút</b>Thời lượng</div>
        </div>
      </section>

      <div className="rp-layout">
        <div className="rp-stack">
          <div className="rp-card">
            <div className="rp-card-title">Giới thiệu buổi</div>
            <p style={{ fontSize: 16 }}>{t.description || 'Robot tự hành đi qua các điểm tham quan, học sinh xem qua một livestream chung, nghe thuyết minh và hỏi trợ lý AI riêng.'}</p>
          </div>
          <div className="rp-card">
            <div className="rp-card-title"><span>Lộ trình dự kiến</span><span>{String(t.stops.length).padStart(2, '0')} điểm</span></div>
            <ol className="rp-stops">
              {t.stops.map((stop, i) => (
                <li key={stop} className="rp-stop"><em>{String(i + 1).padStart(2, '0')}</em><span>{stop}</span></li>
              ))}
            </ol>
          </div>
        </div>

        <aside className="rp-stack">
          <div className="rp-card">
            <div className="rp-card-title">Đăng ký của đoàn bạn</div>
            {t.myRegistrationState && (
              <p style={{ marginBottom: 14 }}><RegistrationChip state={t.myRegistrationState} /></p>
            )}
            {hasActive ? (
              <>
                <p className="rp-muted" style={{ marginBottom: 16 }}>Bạn đã có đăng ký cho buổi này. Mỗi đại diện có một đăng ký cho một buổi; sửa hoặc thay danh sách ngay trong đăng ký đó.</p>
                <Pill to={`/dai-dien/dang-ky/${t.myRegistrationId}`} block>Mở đăng ký của tôi</Pill>
              </>
            ) : t.register.allowed ? (
              <>
                <p className="rp-muted" style={{ marginBottom: 16 }}>
                  {t.myRegistrationState === 'Cancelled'
                    ? 'Đăng ký trước đã hủy. Đăng ký lại sẽ gửi danh sách mới để Admin duyệt.'
                    : 'Chuẩn bị file Excel có cột HoTen (bắt buộc) và Lop (nếu có). Có thể tải file mẫu ở bước tiếp theo.'}
                </p>
                <Pill to={`/dai-dien/buoi/${t.id}/dang-ky`} block>{t.myRegistrationState === 'Cancelled' ? 'Đăng ký lại' : 'Đăng ký đoàn'}</Pill>
              </>
            ) : (
              <div className="rp-callout rp-callout--info">
                <Info size={18} />
                <div><b>Không nhận đăng ký mới</b><p>{t.register.reason}</p></div>
              </div>
            )}
          </div>
          <div className="rp-card rp-card--cream">
            <div className="rp-card-title">Cần biết trước khi đăng ký</div>
            <ul className="rp-stack" style={{ gap: 10, fontSize: 14 }}>
              <li>Mọi thay đổi chỉ làm được khi buổi còn Đang nhận đăng ký. Khi Admin chốt danh sách, đăng ký bị khóa.</li>
              <li>Mỗi lần tải file sẽ thay toàn bộ danh sách cũ; không ghép nhiều file.</li>
              <li>Học sinh không cần tài khoản. Các em vào bằng đường dẫn, mã đoàn, họ tên và lớp.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

import { Link } from 'react-router'
import type { RepresentativeTour } from '../../api/contracts/representative'
import { Loading, Pill, RegistrationChip, TourChip } from '../../features/representative/components/RepUi'
import { useRepRegistrations, useRepTours } from '../../features/representative/representative-hooks'
import { dayMonth, formatTime, readRepError } from '../../features/representative/rep-format'

function TourRow({ tour }: { tour: RepresentativeTour }) {
  const d = dayMonth(tour.scheduledAt)
  const detail = `/dai-dien/buoi/${tour.id}`
  return (
    <li className="rp-row">
      <div className="rp-date">
        <b>{d.day}</b>
        <span>{d.month} · {formatTime(tour.scheduledAt)}</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <h3><Link to={detail}>{tour.name}</Link></h3>
        <div className="rp-row__meta">
          <span className="rp-mono">{tour.code}</span>
          <span>{d.weekday}</span>
          <span>{tour.routeName} · {tour.stops.length} điểm dừng</span>
          <TourChip state={tour.state} />
          {tour.myRegistrationState && <RegistrationChip state={tour.myRegistrationState} />}
        </div>
      </div>
      <div className="rp-row__side">
        {tour.myRegistrationId && tour.myRegistrationState !== 'Cancelled' ? (
          <Pill to={`/dai-dien/dang-ky/${tour.myRegistrationId}`} light>Xem đăng ký</Pill>
        ) : tour.register.allowed ? (
          <Pill to={`${detail}/dang-ky`}>{tour.myRegistrationState === 'Cancelled' ? 'Đăng ký lại' : 'Đăng ký đoàn'}</Pill>
        ) : (
          <>
            <Link to={detail} className="rp-chip-btn">Xem buổi</Link>
            {tour.register.reason && <span className="rp-row__why">{tour.register.reason}</span>}
          </>
        )}
      </div>
    </li>
  )
}

/** Available Tours (flow review §4.1): what can be registered now, then the rest. */
export default function RepToursPage() {
  const tours = useRepTours()
  const registrations = useRepRegistrations()
  const open = tours.data?.filter((t) => t.state === 'Scheduled') ?? []
  const others = tours.data?.filter((t) => t.state !== 'Scheduled') ?? []
  const waiting = registrations.data?.filter((r) => r.state === 'Submitted').length ?? 0
  const approved = registrations.data?.filter((r) => r.state === 'Approved' && r.participation).length ?? 0

  return (
    <div className="rp-ctn">
      <section className="rp-band">
        <img src="/images/hero-campus.jpg" alt="" aria-hidden="true" />
        <div className="rp-band__top">
          <span className="rp-kicker">Đăng ký đoàn tham quan từ xa</span>
        </div>
        <div>
          <h1>Chọn buổi tham quan cho lớp của bạn.</h1>
          <p className="rp-band__lead">
            Robot tự hành đưa cả lớp đi qua khuôn viên trường bằng một livestream chung. Gửi danh sách Excel, chờ Admin duyệt,
            rồi chia sẻ đường dẫn và mã đoàn cho học sinh.
          </p>
        </div>
        <div className="rp-band__meta">
          <div><b>{tours.data ? open.length : '–'}</b>Buổi đang nhận đăng ký</div>
          <div><b>{registrations.data ? waiting : '–'}</b>Đăng ký chờ duyệt</div>
          <div><b>{registrations.data ? approved : '–'}</b>Đoàn đã có mã tham gia</div>
        </div>
        <div className="rp-steps">
          <div><b>01</b>Chọn buổi và nhập thông tin đoàn</div>
          <div><b>02</b>Tải file mẫu, điền HoTen và Lop, tải lên</div>
          <div><b>03</b>Sau khi duyệt: sao chép link và mã đoàn cho học sinh</div>
        </div>
      </section>

      {tours.isLoading && <Loading />}
      {tours.isError && (
        <div className="rp-callout rp-callout--red rp-section" role="alert">
          <div><b>Không tải được danh sách buổi</b><p>{readRepError(tours.error).message}</p></div>
        </div>
      )}

      {tours.data && (
        <>
          <section className="rp-section" aria-labelledby="open-title">
            <div className="rp-sec-head">
              <h2 id="open-title">Đang nhận đăng ký</h2>
              <span className="rp-mono">({String(open.length).padStart(2, '0')})</span>
            </div>
            {open.length ? (
              <ol className="rp-rows">{open.map((t) => <TourRow key={t.id} tour={t} />)}</ol>
            ) : (
              <div className="rp-empty">
                <h3>Chưa có buổi nào đang nhận đăng ký</h3>
                <p>Admin sẽ mở buổi mới trên trang này. Bạn vẫn xem được các đăng ký cũ trong mục Đăng ký của tôi.</p>
              </div>
            )}
          </section>

          {others.length > 0 && (
            <section className="rp-section" aria-labelledby="other-title">
              <div className="rp-sec-head">
                <h2 id="other-title">Buổi khác</h2>
                <span className="rp-mono">Chỉ xem · không nhận đăng ký mới</span>
              </div>
              <ol className="rp-rows">{others.map((t) => <TourRow key={t.id} tour={t} />)}</ol>
            </section>
          )}
        </>
      )}
    </div>
  )
}

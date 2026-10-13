import { useEffect, useState } from 'react'
import { ArrowRight, CircleAlert } from 'lucide-react'
import { Link } from 'react-router'
import type { RegistrationSummary } from '../api/types'
import { repButton } from '../rep-classes'
import { formatDate, formatTime, groupLabel } from '../rep-format'

/* Pieces of the representative overview. Each renders a finished, readable
   state first; motion is CSS and stops for reduced motion. */

/** Labelled buildings on `hero-smartbus.png`, in percent of the picture. */
const HERO_PINS = [
  { label: 'Giảng đường', x: 31, y: 21, delay: 1 },
  { label: 'Thư viện', x: 57, y: 22, delay: 1.15 },
  { label: 'Khu thể thao', x: 86, y: 27, delay: 1.3 },
] as const

/** Time left until `iso`, ticking once a second. */
function useCountdown(iso: string | undefined) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!iso) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [iso])
  let seconds = iso ? Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000)) : 0
  const hours = Math.floor(seconds / 3600); seconds -= hours * 3600
  const minutes = Math.floor(seconds / 60); seconds -= minutes * 60
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0'))
}

/** A small decorative route with a robot riding it. */
function MiniRoute() {
  return (
    <svg className="rep-mini-route" viewBox="0 0 300 46" aria-hidden="true" focusable="false">
      <path id="rep-mini-route" d="M14 23 S 60 6 92 23 S 160 40 196 23 S 250 6 286 23" fill="none" stroke="rgba(214,241,141,.5)" strokeWidth="2.5" strokeDasharray="4 6" />
      {[14, 92, 196, 286].map((x) => <circle key={x} cx={x} cy={23} r={6} fill="#d6f18d" />)}
      <circle r="7" fill="#fff" stroke="#87b661" strokeWidth="3" className="rep-mini-bot">
        <animateMotion dur="7s" repeatCount="indefinite"><mpath href="#rep-mini-route" /></animateMotion>
      </circle>
    </svg>
  )
}

/** The overview hero: campus picture with pins, the greeting and the next visit. */
export function RepHero({ next }: { next: RegistrationSummary | null }) {
  const [h, m, s] = useCountdown(next?.tourScheduledStartAt)
  const group = next ? groupLabel(next) : null
  return (
    <section className="rep-hero" aria-labelledby="rep-hero-title">
      <div className="rep-hero-stage" aria-hidden="true">
        <div className="rep-hero-box">
          <img src="/images/home-3d/hero-smartbus.png" alt="" fetchPriority="high" />
          {HERO_PINS.map((pin) => (
            <span key={pin.label} className="rep-pin" style={{ left: `${pin.x}%`, top: `${pin.y}%`, animationDelay: `${pin.delay}s` }}>
              <span>{pin.label}</span><i /><b />
            </span>
          ))}
        </div>
      </div>
      <div className="rep-hero-content">
        <div>
          <span className="rep-hero-kicker">CỔNG ĐẠI DIỆN TRƯỜNG</span>
          <h1 id="rep-hero-title" aria-label="Đưa cả lớp đi khám phá campus">
            <span className="rep-line"><span>Đưa cả lớp đi</span></span>
            <span className="rep-line"><span>khám phá campus<span style={{ color: '#d6f18d' }}>.</span></span></span>
          </h1>
          <p className="rep-hero-lead">Chọn buổi, gửi danh sách lời mời và theo dõi duyệt đăng ký. Học sinh không cần tài khoản.</p>
          <div className="rep-hero-cta">
            <Link to="/dai-dien/buoi" className={repButton('primary', 'lg')}>Xem buổi tham quan<ArrowRight size={17} className="rep-arrow" aria-hidden="true" /></Link>
            <Link to="/dai-dien/dang-ky" className={repButton('media', 'lg')}>Đăng ký của tôi</Link>
          </div>
        </div>
        {next ? (
          <Link to={`/dai-dien/dang-ky/${next.id}`} className="rep-next" aria-label={`Buổi gần nhất: ${next.tourName}`}>
            <small>BUỔI GẦN NHẤT{group ? ` · ${group.toUpperCase()}` : ''}</small>
            <h2>{next.tourName}</h2>
            <div className="rep-countdown" aria-hidden="true">
              <div><b>{h}</b><span>giờ</span></div><div><b>{m}</b><span>phút</span></div><div><b>{s}</b><span>giây</span></div>
            </div>
            <MiniRoute />
            <p>{formatTime(next.tourScheduledStartAt)}, {formatDate(next.tourScheduledStartAt)}</p>
          </Link>
        ) : (
          <div className="rep-next">
            <small>BUỔI GẦN NHẤT</small>
            <h2>Chưa có buổi sắp tới</h2>
            <MiniRoute />
            <p>Chọn một buổi đang nhận đăng ký để bắt đầu hành trình của lớp bạn.</p>
          </div>
        )}
      </div>
    </section>
  )
}

/** A registration that needs the representative's hand, right under the hero. */
export function RepAttention({ registration: r }: { registration: RegistrationSummary }) {
  const group = groupLabel(r) ?? r.schoolName
  return (
    <div className="rep-attention" role="status">
      <span className="rep-attention-icon" aria-hidden="true"><CircleAlert size={20} /></span>
      <div className="rep-attention-copy">
        <b>{group} cần bạn xử lý</b>
        <p>Admin đã từ chối đăng ký cho {r.tourName}. Sửa và gửi lại khi buổi còn nhận đăng ký.</p>
      </div>
      <Link to={`/dai-dien/dang-ky/${r.id}`} className={repButton('dark', 'sm')}>Xem lý do và sửa<ArrowRight size={15} className="rep-arrow" aria-hidden="true" /></Link>
    </div>
  )
}

/** The closing band of the public Home, with the representative's next step. */
export function RepClosing() {
  return (
    <section className="rep-close" aria-label="Bắt đầu chuyến tham quan">
      <img src="/images/home-3d/closing-smartbus.png" alt="" loading="lazy" decoding="async" />
      <div className="rep-close-in">
        <h2>Một đoàn.<br /><em>Nhiều góc nhìn mới.</em></h2>
        <p>Đưa lớp của bạn khám phá campus từ xa cùng robot SmartBus.</p>
        <div className="rep-close-cta">
          <Link to="/dai-dien/buoi" className={repButton('primary', 'lg')}>Chọn buổi tham quan<ArrowRight size={17} className="rep-arrow" aria-hidden="true" /></Link>
          <Link to="/dai-dien/dang-ky" className={repButton('media', 'lg')}>Đăng ký của tôi</Link>
        </div>
      </div>
    </section>
  )
}

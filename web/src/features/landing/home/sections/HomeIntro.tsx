import type { CSSProperties } from 'react'
import { introStats } from '../home-content'
import { CountUp, DotLink, Kicker, SplitText } from '../primitives'

export function HomeIntro() {
  return (
    <section className="hm-intro" id="gioi-thieu">
      <div className="hm-ctn">
        <div className="hm-split2">
          <div><Kicker className="hm-fade">Giới thiệu</Kicker></div>
          <SplitText
            className="hm-intro__title"
            text="CampusTour định nghĩa lại buổi tham quan trường: học sinh ngồi tại lớp, robot đi thay các em, tự hành qua AI Lab, thư viện và không gian sáng tạo, dừng đúng chỗ, xoay đúng góc và kể đúng câu chuyện."
          />
        </div>
        <div className="hm-intro__images">
          <div className="hm-intro__pic" data-zoom="">
            <img src="/images/login-bg.jpg" alt="Khuôn viên trường với lối đi, cây xanh và các tòa nhà" loading="lazy" decoding="async" />
          </div>
          <div>
            <p className="hm-intro__lead hm-fade">
              Trải nghiệm một buổi tham quan liền mạch, từ phòng chờ trực tuyến tới điểm dừng cuối
              cùng, không cần đi xe, không cần tài khoản.
            </p>
            <div className="hm-stats" id="chi-so">
              {introStats.map((s, i) => (
                <div className="hm-stat hm-fade" key={s.id} style={{ '--d': `${i * 120}ms` } as CSSProperties}>
                  <h3><CountUp value={s.value} prefix={s.prefix} />{s.unit}</h3>
                  <p>{s.note}</p>
                </div>
              ))}
            </div>
            <div className="hm-fade" style={{ marginTop: 40 }}>
              <DotLink href="#trai-nghiem">Tìm hiểu trải nghiệm tham quan</DotLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

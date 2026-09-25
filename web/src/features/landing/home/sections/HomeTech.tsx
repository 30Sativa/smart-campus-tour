import { techStack } from '../home-content'
import { CountUp, DotLink, Kicker, RevealWords } from '../primitives'

/** Photo ground, a scroll-lit paragraph and the stack names in a marquee. */
export function HomeTech() {
  const names = [...techStack, ...techStack]

  return (
    <section className="hm-partner" id="cong-nghe">
      <div className="hm-partner__bg" aria-hidden="true">
        <img src="/images/hero-campus.jpg" alt="" loading="lazy" decoding="async" />
      </div>
      <div className="hm-ctn hm-partner__inner">
        <div className="hm-split2">
          <div><Kicker>Nền tảng và công nghệ</Kicker></div>
          <RevealWords
            id="hm-partner-words"
            className="hm-partner__words"
            text="CampusTour phối hợp năm khối độc lập: web, backend, robot, trợ lý AI và digital twin. Mỗi khối giữ đúng trách nhiệm của mình, nói chuyện qua contract rõ ràng, để cả buổi tham quan chạy trơn tru từ lớp học tới khuôn viên."
          />
        </div>
        <div className="hm-partner__foot">
          <div>
            <h3><CountUp value={5} pad={2} /></h3>
            <p>Khối hệ thống trong một repo: web, backend, robot, ai-assistant, digital-twin.</p>
          </div>
          <div>
            <div className="hm-logos">
              <div className="hm-logos__track">
                {names.map((t, i) => (
                  <span key={i} aria-hidden={i >= techStack.length || undefined}>
                    {t.name}{t.note && <small>{t.note}</small>}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 36 }}>
              <DotLink href="#goc-ky-thuat">Đọc ghi chép kỹ thuật của nhóm</DotLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

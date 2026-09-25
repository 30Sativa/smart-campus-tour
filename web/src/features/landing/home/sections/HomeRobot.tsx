import type { CSSProperties } from 'react'
import { robotSpecs } from '../home-content'
import { CountUp } from '../primitives'

/** Big figure, the robot driving in from the left, four specs underneath. */
export function HomeRobot() {
  return (
    <section className="hm-robot" id="robot">
      <div className="hm-ctn">
        <div className="hm-robot__head">
          <div className="hm-mono hm-robot__kicker">Một robot · Nhiều đoàn · Cùng lúc</div>
          <div className="hm-robot__big"><CountUp value={30} /><sup>phút / buổi</sup></div>
          <p className="hm-fade">
            Một robot thật trong khu vực trong nhà giới hạn, đưa nhiều đoàn học sinh tham quan cùng
            một livestream. Luồng bình thường tự chạy, Staff luôn sẵn sàng giữ, đi tiếp hoặc kết thúc sớm.
          </p>
        </div>
        <div className="hm-robot__img" id="hm-robot-img">
          <div className="hm-robot__road" aria-hidden="true" />
          <img src="/smartbus-robot.jpg" alt="Minh hoạ robot tự hành CampusTour với màn hình mặt cười và dải đèn xanh" loading="lazy" decoding="async" />
        </div>
        <div className="hm-robot__specs">
          {robotSpecs.map((s, i) => (
            <div key={s.id} className="hm-spec hm-fade" style={{ '--d': `${i * 100}ms` } as CSSProperties}>
              <div className="hm-mono">{s.title}</div>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

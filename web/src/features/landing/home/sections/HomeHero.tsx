import type { CSSProperties } from 'react'
import { useAuthStore } from '../../../../stores/auth-store'
import { homePathForRole, isAdminRole, isRepresentativeRole, isStaffRole, normalizeRole } from '../../../../auth/roles'
import { EXPERIENCE_HREF } from '../../landing-content'
import { heroMeta } from '../home-content'
import { Kicker, PillLink, SplitText } from '../primitives'

/**
 * Full-bleed campus footage, kicker on the left, the claim in large capitals on
 * the right. A signed-in account gets the door to its own area.
 */
export function HomeHero() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)

  const cta = isAuthenticated && normalizeRole(user?.role)
    ? {
        to: homePathForRole(user?.role),
        label: isAdminRole(user?.role) ? 'Vào trang quản trị' : isStaffRole(user?.role) ? 'Vào trang điều hành' : isRepresentativeRole(user?.role) ? 'Vào trang đại diện' : 'Trải nghiệm Campus Tour',
      }
    : { to: EXPERIENCE_HREF, label: 'Trải nghiệm Campus Tour' }

  return (
    <section className="hm-hero" id="hero">
      <div className="hm-hero__media">
        <video
          src="/videos/home.mp4"
          poster="/images/hero-campus.jpg"
          autoPlay
          muted
          loop
          playsInline
          aria-label="Robot tự hành đi trên lối đi trong khuôn viên trường lúc chiều tối"
        />
      </div>
      <div className="hm-ctn hm-hero__body">
        <div className="hm-hero__left">
          <Kicker>Tham quan khuôn viên từ xa</Kicker>
          <div className="hm-live"><i />Live · Robot tự hành</div>
        </div>
        <div className="hm-hero__right">
          <div>
            <SplitText as="h1" className="hm-hero__title" text={['Khuôn viên trường,', 'tới tận lớp học.']} auto />
            <div className="hm-fade" style={{ marginTop: 36, '--d': '500ms' } as CSSProperties}>
              <PillLink to={cta.to}>{cta.label}</PillLink>
            </div>
          </div>
          <div className="hm-fade" style={{ '--d': '700ms' } as CSSProperties}>
            <p className="hm-hero__desc">
              Một robot tự hành mang camera trên giá xoay, đưa nhiều đoàn học sinh đi qua từng điểm
              tham quan của trường bằng một livestream chung, bản đồ 2D và trợ lý AI trả lời riêng.
            </p>
            <div className="hm-hero__meta">
              {heroMeta.map((m) => (
                <div key={m.label}><b>{m.value}</b>{m.label}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

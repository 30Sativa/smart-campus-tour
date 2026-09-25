import { useRef } from 'react'
import { HomeNav } from '../../features/landing/home/sections/HomeNav'
import { HomeHero } from '../../features/landing/home/sections/HomeHero'
import { HomeIntro } from '../../features/landing/home/sections/HomeIntro'
import { HomeServices } from '../../features/landing/home/sections/HomeServices'
import { HomeSolution } from '../../features/landing/home/sections/HomeSolution'
import { HomeProcess } from '../../features/landing/home/sections/HomeProcess'
import { HomeRobot } from '../../features/landing/home/sections/HomeRobot'
import { HomeTech } from '../../features/landing/home/sections/HomeTech'
import { HomeInsights } from '../../features/landing/home/sections/HomeInsights'
import { HomeFaq } from '../../features/landing/home/sections/HomeFaq'
import { HomeFooter } from '../../features/landing/home/sections/HomeFooter'
import { useHomeMotion } from '../../features/landing/home/use-home-motion'
import '../../features/landing/home/home.css'

/**
 * Public home page for CampusTour DT-AMR, laid out on the Himon template
 * structure: hero, intro and figures, the five parts of the experience, the
 * solution band, one tour in four steps, the robot, the platform, technical
 * notes, questions, and the closing call.
 *
 * Copy lives in `features/landing/home/home-content.ts`; all motion is set up
 * once in `useHomeMotion` and switches off for reduced motion.
 */
export default function PublicHomePage() {
  const rootRef = useRef<HTMLDivElement>(null)
  const { lockScroll } = useHomeMotion(rootRef)

  return (
    <div className="hm" ref={rootRef} id="top">
      <HomeNav onLockScroll={lockScroll} />
      <main>
        <HomeHero />
        <HomeIntro />
        <HomeServices />
        <HomeSolution />
        <HomeProcess />
        <HomeRobot />
        <HomeTech />
        <HomeInsights />
        <HomeFaq />
      </main>
      <HomeFooter />
    </div>
  )
}

import { useEffect } from 'react'
import { SiteNav } from '../../features/landing/sections/SiteNav'
import { SiteFooter } from '../../features/landing/sections/SiteFooter'
import { RobotFlowSection } from '../../features/landing/sections/RobotFlowSection'
import '../../features/landing/landing.css'
import '../../features/landing/home-3d.css'
import { usePageTitle } from '../../components/ui/use-page-title'

const noScrollLock = () => {}

/**
 * "/ben-trong-robot": the robot's functions step by step, from the mini PC to
 * the wheels, the head, the video and the power. Linked from the public
 * navigation and from section 04 of the home page.
 */
export default function RobotInsidePage() {
  usePageTitle('Bên trong robot')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="lp lp3 lp3-page" id="top">
      <SiteNav base="/" current="robot" onLockScroll={noScrollLock} />
      <main>
        <RobotFlowSection asPage />
      </main>
      <SiteFooter base="/" />
    </div>
  )
}

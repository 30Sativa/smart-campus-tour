import { useEffect } from 'react'
import { SiteNav } from '../../features/landing/sections/SiteNav'
import { SiteFooter } from '../../features/landing/sections/SiteFooter'
import { RobotFlowSection } from '../../features/landing/sections/RobotFlowSection'
import '../../features/landing/landing.css'
import '../../features/landing/home-3d.css'

const noScrollLock = () => {}

/**
 * "/ben-trong-robot": the robot's functions step by step, from the mini PC to
 * the wheels, the head, the video and the power. Linked from the public
 * navigation and from section 04 of the home page.
 */
export default function RobotInsidePage() {
  useEffect(() => {
    const previous = document.title
    document.title = 'Bên trong robot · CampusTour'
    window.scrollTo(0, 0)
    return () => { document.title = previous }
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

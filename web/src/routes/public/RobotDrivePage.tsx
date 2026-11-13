import { Suspense, lazy, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ViewerBoundary } from '../../features/landing/robot-explode/ViewerBoundary'
import { DriveLoader } from '../../features/landing/robot-explode/DriveLoader'
import { canUseWebGL } from '../../features/landing/robot-explode/webgl'
import { usePageTitle } from '../../components/ui/use-page-title'
import '../../features/landing/landing.css'
import '../../features/landing/home-3d.css'

// three.js, the robot and the maps load with this page only.
const RobotDriveViewer = lazy(() => import('../../features/landing/robot-explode/RobotDriveViewer'))

/** The way back to the home page and the page's title, small in the top left corner. */
function Intro() {
  return (
    <div className="lp3-dv__intro">
      <a href="/#cong-nghe" className="lp3-dv__back" aria-label="Về trang chủ" title="Về trang chủ"><ArrowLeft size={17} aria-hidden="true" /></a>
      <div>
        <span>Lái thử · mô phỏng trực tiếp</span>
        <h1>Lái robot quanh khuôn viên.</h1>
      </div>
    </div>
  )
}

/** Where the stage cannot be drawn: the title, the reason and the way back. */
function Unavailable({ text }: { text: string }) {
  return (
    <div className="lp3-dv lp3-dv--still">
      <div className="lp3-dv__top"><Intro /></div>
      <p className="lp3-dv__still" role="status">{text}</p>
    </div>
  )
}

/**
 * "/lai-thu-robot": the test drive, the whole screen, with no site navigation
 * (a button in the top left goes back to the home page). The robot on the FPT
 * University campus demo map (people and traffic, day or night) or the
 * operations Twin's floor, a small control panel in the bottom right, and a
 * loading screen while the 3D code and the map download. Driving only: the
 * robot's parts are in the home page's section 04, which links here. A web
 * simulation only: nothing is sent to a robot.
 */
export default function RobotDrivePage() {
  const [webgl] = useState(canUseWebGL)
  usePageTitle('Lái thử robot')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <main className="lp lp3 lp3-drivepage">
      {webgl ? (
        <ViewerBoundary fallback={<Unavailable text="Không tải được bản đồ 3D. Hãy tải lại trang." />}>
          <Suspense fallback={<DriveLoader label="Đang tải trình lái" />}>
            <RobotDriveViewer intro={<Intro />} />
          </Suspense>
        </ViewerBoundary>
      ) : <Unavailable text="Trình duyệt này không hiển thị được bản đồ 3D." />}
    </main>
  )
}

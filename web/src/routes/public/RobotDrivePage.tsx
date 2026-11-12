import { Suspense, lazy, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { SiteNav } from '../../features/landing/sections/SiteNav'
import { ViewerBoundary } from '../../features/landing/robot-explode/ViewerBoundary'
import { canUseWebGL } from '../../features/landing/robot-explode/webgl'
import '../../features/landing/landing.css'
import '../../features/landing/home-3d.css'

// three.js, the robot and the maps load with this page only.
const RobotDriveViewer = lazy(() => import('../../features/landing/robot-explode/RobotDriveViewer'))

const noScrollLock = () => {}

/** The page's title and how to drive, over the map's left side. */
function Intro() {
  return (
    <>
      <span className="lp3-td__kicker"><i aria-hidden="true" />Lái thử · mô phỏng trực tiếp</span>
      <h1 className="lp3-td__title">Lái robot <em>quanh khuôn viên.</em></h1>
      <p className="lp3-td__lead">W A S D hoặc phím mũi tên để lái, Space phanh, P để robot tự đi qua các điểm dừng, C đổi máy quay.</p>
      <a href="/#cong-nghe" className="lp3-td__btn lp3-td__more"><ArrowLeft size={16} aria-hidden="true" />Về trang chủ</a>
    </>
  )
}

/**
 * "/lai-thu-robot": the test drive, the whole screen under the navigation.
 * The robot on the FPT University campus demo map (people and traffic, day or
 * night) or the operations Twin's floor. Driving only: the robot's parts are
 * in the home page's section 04, which links here. A web simulation only:
 * nothing is sent to a robot.
 */
export default function RobotDrivePage() {
  const [webgl] = useState(canUseWebGL)

  useEffect(() => {
    const previous = document.title
    document.title = 'Lái thử robot · CampusTour'
    window.scrollTo(0, 0)
    return () => { document.title = previous }
  }, [])

  const still = (text: string, busy: boolean) => (
    <div className="lp3-td lp3-td--still">
      <div className="lp3-td__scrim" aria-hidden="true" />
      <div className="lp3-td__intro"><Intro /></div>
      <p className="lp3-td__wait" role="status">{busy && <span aria-hidden="true" />}{text}</p>
    </div>
  )

  return (
    <div className="lp lp3 lp3-page lp3-drivepage" id="top">
      <SiteNav base="/" onLockScroll={noScrollLock} />
      <main>
        <section className="lp3-techdrive lp3-techdrive--page" id="lai-thu" aria-label="Lái thử robot" data-story="off">
          <div className="lp3-techdrive__pin">
            {webgl ? (
              <ViewerBoundary fallback={still('Không tải được bản đồ 3D.', false)}>
                <Suspense fallback={still('Đang tải bản đồ…', true)}>
                  <RobotDriveViewer intro={<Intro />} />
                </Suspense>
              </ViewerBoundary>
            ) : still('Trình duyệt này không hiển thị được bản đồ 3D.', false)}
          </div>
        </section>
      </main>
    </div>
  )
}

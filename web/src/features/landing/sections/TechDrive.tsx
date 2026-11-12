import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Gamepad2 } from 'lucide-react'
import { ViewerBoundary } from '../robot-explode/ViewerBoundary'
import { canUseWebGL } from '../robot-explode/webgl'
import { STORY_CHAPTERS, STORY_SCREENS, storyPhase, storyProgress } from '../robot-explode/story'
import { prefersReducedMotion } from '../landing-motion'
import { ROBOT_DRIVE } from '../landing-content'

// three.js and the robot model load only once section 04 comes near the screen; the maps live on the test-drive page.
const RobotShowcase = lazy(() => import('../robot-explode/RobotShowcase'))


const DONE = STORY_CHAPTERS.length

const More = () => <Link to="/ben-trong-robot" className="lp3-td__btn lp3-td__more">Xem dữ liệu chạy bên trong robot <ArrowRight size={16} aria-hidden="true" /></Link>
/** The same link, short, beside the test drive (its name still says where it goes). */
const Inside = () => <Link to="/ben-trong-robot" className="lp3-td__btn lp3-td__more" aria-label="Xem dữ liệu chạy bên trong robot">Bên trong robot <ArrowRight size={16} aria-hidden="true" /></Link>
const Drive = () => <Link to={ROBOT_DRIVE.to} className="lp3-td__btn lp3-td__btn--lime lp3-td__drive"><Gamepad2 size={17} aria-hidden="true" />Lái thử robot</Link>

/** The section's title and text beside the robot, once the story has played. */
function Intro() {
  return (
    <>
      <span className="lp3-td__kicker"><i aria-hidden="true" />04 / Công nghệ · mô hình 3D</span>
      <h2 className="lp3-td__title">Công nghệ đứng sau <em>mỗi điểm dừng.</em></h2>
      <p className="lp3-td__lead">Xoay, bung và mở vỏ robot để xem từng linh kiện. Muốn tự cầm lái? Mở bản đồ lái thử.</p>
      <div className="lp3-td__go">
        <Drive />
        <Inside />
      </div>
    </>
  )
}

/** One chapter of the story: its number, a two-line title (the second dimmed) and a line of text. */
function Chapter({ index }: { index: number }) {
  const chapter = STORY_CHAPTERS[index]
  return (
    <div className="lp3-story" key={index}>
      <h2 className="sr-only">Công nghệ đứng sau mỗi điểm dừng.</h2>
      <span className="lp3-story__kicker">{chapter.kicker}</span>
      <h3 className="lp3-story__title">{chapter.title} <em>{chapter.after}</em></h3>
      <p className="lp3-story__body">{chapter.body}</p>
      <div className="lp3-td__go">
        <Drive />
        <More />
      </div>
    </div>
  )
}

/**
 * Section 04 / Công nghệ: the robot alone on a dark stage, no map. It opens
 * with a scroll story: the section is several screens tall and its card stays
 * on screen while the visitor scrolls, which plays five chapters like a film
 * scrubbed by the scroll bar (the robot driving, a scan along it, its digital
 * model, the route ahead, the decision on its computer). The last screen
 * shows its parts: the visitor turns it, takes it apart, opens it and picks
 * parts. "Lái thử robot" leads to the test-drive page with the maps. Visitors
 * who ask for reduced motion get the parts straight away.
 *
 * The robot loads only once the section comes near the screen; until then,
 * and where WebGL is missing, the text stands on a dark backdrop with a status.
 */
export function TechDrive() {
  const [reduced] = useState(prefersReducedMotion)
  const [mode, setMode] = useState<'waiting' | '3d' | 'none'>('waiting')
  const [visible, setVisible] = useState(false)
  const [chapter, setChapter] = useState(reduced ? DONE : 0)
  const storyRef = useRef(reduced ? 1 : 0)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      const near = Boolean(entry?.isIntersecting)
      setVisible(near)
      if (near) setMode(current => (current !== 'waiting' ? current : canUseWebGL() ? '3d' : 'none'))
    }, { rootMargin: '320px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Scroll position → story progress, read every frame while the section is near (smooth scrolling included).
  useEffect(() => {
    const node = ref.current
    if (reduced || !visible || !node) return
    let frame = 0
    const read = () => {
      const box = node.getBoundingClientRect()
      const range = box.height - window.innerHeight
      const story = storyProgress(range > 0 ? -box.top / range : 1)
      storyRef.current = story
      setChapter(storyPhase(story).index)
      frame = requestAnimationFrame(read)
    }
    frame = requestAnimationFrame(read)
    return () => cancelAnimationFrame(frame)
  }, [reduced, visible])

  const intro = chapter >= DONE ? <Intro /> : <Chapter index={chapter} />
  const still = (text: string, busy: boolean) => (
    <div className="lp3-td lp3-td--still">
      <div className="lp3-td__scrim" aria-hidden="true" />
      <div className="lp3-td__intro">{intro}</div>
      <p className="lp3-td__wait" role="status">{busy && <span aria-hidden="true" />}{text}</p>
    </div>
  )

  return (
    <section className="lp3-techdrive" id="cong-nghe" ref={ref} aria-label="04 / Công nghệ" data-story={reduced ? 'off' : 'on'} style={{ ['--td-screens' as string]: STORY_SCREENS + 2 }}>
      <div className="lp3-techdrive__pin">
        {mode === '3d' ? (
          <ViewerBoundary fallback={still('Không tải được mô hình 3D.', false)}>
            <Suspense fallback={still('Đang tải mô hình robot…', true)}>
              <RobotShowcase visible={visible} intro={intro} storyRef={storyRef} chapter={chapter} driveTo={ROBOT_DRIVE.to} />
            </Suspense>
          </ViewerBoundary>
        ) : still(mode === 'none' ? 'Trình duyệt này không hiển thị được mô hình 3D.' : 'Đang tải mô hình robot…', mode === 'waiting')}
      </div>
    </section>
  )
}

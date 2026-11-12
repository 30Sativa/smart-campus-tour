import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Gamepad2, Play } from 'lucide-react'
import { ViewerBoundary } from '../robot-explode/ViewerBoundary'
import { canUseWebGL } from '../robot-explode/webgl'
import { STORY_CHAPTERS } from '../robot-explode/story'
import { prefersReducedMotion } from '../landing-motion'
import { ROBOT_DRIVE } from '../landing-content'
import { IntroVideo } from './IntroVideo'

// three.js and the robot model load once section 04 comes near the screen, while the intro video plays;
// the maps live on the test-drive page.
const RobotPartsViewer = lazy(() => import('../robot-explode/RobotPartsViewer'))

const More = () => <Link to="/ben-trong-robot" className="lp3-td__btn lp3-td__more">Xem dữ liệu chạy bên trong robot <ArrowRight size={16} aria-hidden="true" /></Link>
/** The same link, short, beside the test drive (its name still says where it goes). */
const Inside = () => <Link to="/ben-trong-robot" className="lp3-td__btn lp3-td__more" aria-label="Xem dữ liệu chạy bên trong robot">Bên trong robot <ArrowRight size={16} aria-hidden="true" /></Link>
const Drive = () => <Link to={ROBOT_DRIVE.to} className="lp3-td__btn lp3-td__btn--lime lp3-td__drive"><Gamepad2 size={17} aria-hidden="true" />Lái thử robot</Link>

/** The section's title and links beside the robot's parts, and the way back to the video. */
function Intro({ watched, onWatch }: { watched: boolean; onWatch: () => void }) {
  return (
    <>
      <div className="lp3-td__heading">
        <span className="lp3-td__kicker"><i aria-hidden="true" />04 / Công nghệ · mô hình 3D</span>
        <button type="button" className="lp3-td__replay" onClick={onWatch}><Play size={12} aria-hidden="true" />{watched ? 'Xem lại video' : 'Xem video giới thiệu'}</button>
      </div>
      <h2 className="lp3-td__title">Công nghệ đứng sau <em>mỗi điểm dừng.</em></h2>
      <p className="lp3-td__lead">Xoay, bung và mở vỏ robot để xem từng linh kiện. Muốn tự cầm lái? Mở bản đồ lái thử.</p>
      <div className="lp3-td__go">
        <Drive />
        <Inside />
      </div>
    </>
  )
}

/** One chapter of the intro video: its number, a two-line title (the second dimmed) and a line of text. */
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

const renderChapter = (index: number) => <Chapter index={index} />

/**
 * Section 04 / Công nghệ, one screen tall. It opens with a short intro video
 * of the robot (five chapters, their text over it, skippable); meanwhile the
 * 3D robot loads underneath, and at the end of the video the section turns to
 * its parts: the visitor turns it, takes it apart, opens its casing and picks
 * parts. "Lái thử robot" leads to the test-drive page with the maps. Visitors
 * who ask for reduced motion get the parts straight away, the video one click
 * off.
 *
 * Where WebGL is missing, the text stands on a dark backdrop with a status.
 */
export function TechDrive() {
  const [reduced] = useState(prefersReducedMotion)
  const [phase, setPhase] = useState<'intro' | 'parts'>(reduced ? 'parts' : 'intro')
  /** The video's layer, kept a moment after the intro so it can fade. */
  const [introShown, setIntroShown] = useState(!reduced)
  const [watched, setWatched] = useState(false)
  const [replay, setReplay] = useState(0)
  const [near, setNear] = useState(false)
  const [inView, setInView] = useState(false)
  const [webgl, setWebgl] = useState<boolean | null>(null)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const ahead = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setNear(true)
      setWebgl(current => current ?? canUseWebGL())
    }, { rootMargin: '480px 0px' })
    const seen = new IntersectionObserver(([entry]) => setInView((entry?.intersectionRatio ?? 0) > 0.3), { threshold: [0, 0.3, 0.6] })
    ahead.observe(node)
    seen.observe(node)
    return () => { ahead.disconnect(); seen.disconnect() }
  }, [])

  useEffect(() => {
    if (phase !== 'parts' || !introShown) return
    const id = window.setTimeout(() => setIntroShown(false), 700)
    return () => window.clearTimeout(id)
  }, [phase, introShown])

  const finish = useCallback(() => { setPhase('parts'); setWatched(true) }, [])
  const watch = useCallback(() => { setIntroShown(true); setPhase('intro'); setReplay(value => value + 1) }, [])

  const intro = <Intro watched={watched} onWatch={watch} />
  const still = (text: string, busy: boolean) => (
    <div className="lp3-td lp3-td--still">
      <div className="lp3-td__scrim" aria-hidden="true" />
      <div className="lp3-td__intro">{intro}</div>
      <p className="lp3-td__wait" role="status">{busy && <span aria-hidden="true" />}{text}</p>
    </div>
  )
  const showingIntro = phase === 'intro'

  return (
    <section className="lp3-techdrive" id="cong-nghe" ref={ref} aria-label="04 / Công nghệ" data-phase={phase}>
      <div className="lp3-techdrive__pin">
        <div className="lp3-techdrive__stack">
          <div className="lp3-techdrive__layer" aria-hidden={showingIntro || undefined} inert={showingIntro}>
            {webgl === false
              ? still('Trình duyệt này không hiển thị được mô hình 3D.', false)
              : near && webgl
                ? (
                    <ViewerBoundary fallback={still('Không tải được mô hình 3D.', false)}>
                      <Suspense fallback={still('Đang tải mô hình robot…', true)}>
                        <RobotPartsViewer visible={inView && !showingIntro} intro={intro} driveTo={ROBOT_DRIVE.to} />
                      </Suspense>
                    </ViewerBoundary>
                  )
                : still('Đang tải mô hình robot…', true)}
          </div>
          {introShown && <IntroVideo active={inView && showingIntro} leaving={!showingIntro} replay={replay} chapter={renderChapter} onDone={finish} />}
        </div>
      </div>
    </section>
  )
}

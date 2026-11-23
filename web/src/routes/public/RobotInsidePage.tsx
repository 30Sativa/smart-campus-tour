import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, Gamepad2 } from 'lucide-react'
import { SiteNav } from '../../features/landing/sections/SiteNav'
import { SiteFooter } from '../../features/landing/sections/SiteFooter'
import { RobotFlowWorkbench } from '../../features/landing/sections/RobotFlowWorkbench'
import { WiringMap, type Selection } from '../../features/landing/robot-inside/WiringMap'
import { WireTable } from '../../features/landing/robot-inside/WireTable'
import { isInsideId } from '../../features/landing/robot-inside/wiring'
import { ROBOT_DRIVE, ROBOT_INSIDE } from '../../features/landing/landing-content'
import { usePageTitle } from '../../components/ui/use-page-title'
import '../../features/landing/landing.css'
import '../../features/landing/home-3d.css'

const noScrollLock = () => {}

const FIGURES = [
  { value: '48 V', label: 'Pin LiFePO4 nuôi toàn bộ xe' },
  { value: '2 bộ não', label: 'Mini PC tính đường, STM32 phát xung' },
  { value: '50 Hz', label: 'Khung báo về từ mạch lên máy tính' },
  { value: '16 000', label: 'Xung STEP cho một vòng bánh' },
] as const

/**
 * "/ben-trong-robot": inside the robot. A drawing of every part in its place
 * with the cables between them (power, commands, readings, video) and what
 * each part does; then the robot's functions step by step on the 3D model
 * (RobotFlowWorkbench, `?flow=&step=`); then every
 * cable as a table with its pins. Opened from section 04 of the home page,
 * `?linh-kien=<part>` opening the drawing on one part.
 */
export default function RobotInsidePage() {
  usePageTitle(ROBOT_INSIDE.label)
  const [params, setParams] = useSearchParams()
  const [selection, setSelection] = useState<Selection>(() => {
    const id = params.get(ROBOT_INSIDE.partParam)
    return isInsideId(id) ? { type: 'part', id } : null
  })
  const mapRef = useRef<HTMLElement>(null)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const select = useCallback((next: Selection) => {
    setSelection(next)
    setParams(current => {
      const updated = new URLSearchParams(current)
      if (next?.type === 'part') updated.set(ROBOT_INSIDE.partParam, next.id)
      else updated.delete(ROBOT_INSIDE.partParam)
      return updated
    }, { replace: true, preventScrollReset: true })
  }, [setParams])

  /** From the table: open the cable on the drawing and bring the drawing into view. */
  const showOnMap = useCallback((next: Selection) => {
    select(next)
    mapRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [select])

  return (
    <div className="lp lp3 lp3-page lp3-inside" id="top">
      <SiteNav base="/" onLockScroll={noScrollLock} />
      <main>
        <header className="lp3-inside__hero">
          <div className="lp3-container">
            <a href="/#cong-nghe" className="lp3-inside__back"><ArrowLeft size={16} aria-hidden="true" />Công nghệ</a>
            <div className="lp3-section-head">
              <span className="lp3-kicker">{ROBOT_INSIDE.label}</span>
              <h1>Điện chạy từ pin<br />tới từng bánh xe.</h1>
              <p>Mở vỏ robot CampusTour ra để thấy từng bộ phận, từng đường dây và cách hai bộ não nói chuyện với nhau. Bấm vào bất cứ thứ gì trên hình để xem nó làm gì.</p>
            </div>
            <dl className="lp3-inside__figures">
              {FIGURES.map(item => <div key={item.value}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
            </dl>
            <nav className="lp3-inside__jump" aria-label="Trên trang này">
              <a href="#so-do-di-day">Sơ đồ đi dây</a>
              <a href="#cach-hoat-dong">Từng bước hoạt động</a>
              <a href="#bang-di-day">Bảng đi dây</a>
            </nav>
          </div>
        </header>

        <section className="lp3-inside__map" id="so-do-di-day" ref={mapRef} aria-labelledby="so-do-di-day-title">
          <div className="lp3-container">
            <div className="lp3-section-head">
              <span className="lp3-kicker">01 / Sơ đồ đi dây</span>
              <h2 id="so-do-di-day-title">Mọi sợi dây, một bản vẽ.</h2>
              <p>Vỏ xe được nhìn xuyên qua. Màu của dây cho biết nó mang gì: điện 48 V cho bánh xe, điện hạ áp cho các mạch, lệnh đi xuống, tín hiệu báo về và hình ảnh.</p>
            </div>
          </div>
          <div className="lp3-inside__card">
            <WiringMap selection={selection} onSelect={select} />
          </div>
        </section>

        <RobotFlowWorkbench kicker="02 / Cách hoạt động" />

        <section className="lp3-inside__table lp3-section" id="bang-di-day" aria-labelledby="bang-di-day-title">
          <div className="lp3-container">
            <div className="lp3-section-head">
              <span className="lp3-kicker">03 / Bảng đi dây</span>
              <h2 id="bang-di-day-title">Từng đường dây,<br />từng chân cắm.</h2>
              <p>Cho người muốn đi sâu hơn: mức điện và chân STM32 của mỗi đường, theo pin map của firmware. Bấm tên một đường để xem nó trên bản vẽ.</p>
            </div>
            <WireTable selection={selection} onSelect={showOnMap} />
          </div>
        </section>

        <section className="lp3-inside__end">
          <div className="lp3-container">
            <h2>Đã xem bên trong. Giờ thử cầm lái.</h2>
            <div className="lp3-inside__end-actions">
              <Link to={ROBOT_DRIVE.to} className="lp3-td__btn lp3-td__btn--lime"><Gamepad2 size={17} aria-hidden="true" />{ROBOT_DRIVE.label}</Link>
              <a href="/#cong-nghe" className="lp3-inside__end-back">Về phần Công nghệ <ArrowRight size={16} aria-hidden="true" /></a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter base="/" />
    </div>
  )
}

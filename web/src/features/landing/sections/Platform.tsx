import { Cpu, LayoutDashboard, Radar, Server } from 'lucide-react'
import { platformPillars } from '../landing-content'

const iconMap = {
  cpu: Cpu,
  radar: Radar,
  server: Server,
  layout: LayoutDashboard,
} as const

/**
 * Four pillars on a hairline grid. The accent curtain on hover is pure CSS, so
 * it costs one transform instead of a scripted colour rewrite, and the text
 * keeps its contrast in both the resting and the filled state.
 */
export function Platform() {
  return (
    <section className="lp-sec lp-ctn" id="nen-tang">
      <div className="lp-plat__head">
        <h2 className="lp-h2" data-reveal>
          Nền tảng kỹ thuật phía sau
        </h2>
        <p className="lp-body" data-reveal style={{ marginTop: 18 }}>
          Bốn khối công nghệ được phát triển và kiểm thử liên tục theo phương pháp Agile.
        </p>
      </div>

      <div className="lp-plat__grid">
        {platformPillars.map((pillar) => {
          const Icon = iconMap[pillar.icon]
          return (
            <div className="lp-plat__cell" key={pillar.id} data-reveal>
              <span className="lp-plat__icon" aria-hidden="true">
                <Icon size={24} strokeWidth={1.75} />
              </span>
              <h3 className="lp-plat__title">{pillar.title}</h3>
              <p className="lp-plat__sub">{pillar.sub}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

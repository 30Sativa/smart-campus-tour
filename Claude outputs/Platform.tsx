import { Cpu, LayoutDashboard, Radar, Server } from 'lucide-react'
import { platformPillars } from '../landing-content'

const iconMap = {
  cpu: Cpu,
  radar: Radar,
  server: Server,
  layout: LayoutDashboard,
} as const

/**
 * Four pillars on a hairline grid, each read in the same order: what it is,
 * what it buys you, then the stack that does it. A reader who does not know
 * what Nav2 is still learns something from the middle line; a reader who came
 * for the stack finds it on the last one.
 */
export function Platform() {
  return (
    <section className="lp-sec lp-ctn" id="nen-tang">
      <div className="lp-plat__head">
        <h2 className="lp-h2" data-reveal>
          Nền tảng kỹ thuật phía sau
        </h2>
        <p className="lp-body" data-reveal>
          Bốn khối công nghệ được phát triển và kiểm thử liên tục theo phương pháp Agile.
        </p>
      </div>

      <div className="lp-plat__grid">
        {platformPillars.map((pillar) => {
          const Icon = iconMap[pillar.icon]
          return (
            <article className="lp-plat__cell" key={pillar.id} data-reveal>
              <span className="lp-plat__icon" aria-hidden="true">
                <Icon size={22} strokeWidth={1.75} />
              </span>
              <h3 className="lp-plat__title">{pillar.title}</h3>
              <p className="lp-plat__benefit">{pillar.benefit}</p>
              <ul className="lp-plat__stack">
                {pillar.stack.map((tech) => (
                  <li key={tech}>{tech}</li>
                ))}
              </ul>
            </article>
          )
        })}
      </div>
    </section>
  )
}

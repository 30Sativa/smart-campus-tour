import { Link } from 'react-router'
import { ArrowUpRight, Building2, Footprints } from 'lucide-react'
import type { CampusLocation } from '../../../api/contracts/visitor'
import { CATEGORY_LABEL } from '../visitor-content'
import { formatDistance, formatWalk } from '../visitor-format'

/**
 * One campus place.
 *
 * The card is the surface's `.vs-card`, which is the landing page's media-plus-
 * copy block at application density: the same 14px radius, the same hairline, the
 * same photograph-scales-on-hover gesture as `.lp-step__img`, and the actions on
 * the card's own baseline so a row lines up whatever the length of the copy.
 *
 * The whole card is a link to the detail page (`.vs-card__hit`), and the buttons
 * sit above that hit area so they stay individually clickable.
 */
export function LocationCard({
  location,
  actions,
}: {
  location: CampusLocation
  /** Extra actions for the context the card is in. `View details` is always here. */
  actions?: React.ReactNode
}) {
  const walk = formatWalk(location.walkMinutes)

  return (
    <article className="vs-card vs-card--link vs-location">
      <div className="vs-card__media">
        <img src={location.imageUrl} alt="" loading="lazy" decoding="async" />
        <span className="vs-card__tag">{CATEGORY_LABEL[location.category]}</span>
      </div>

      <Link to={`/visit/explore/${location.id}`} className="vs-card__hit" aria-label={`View details for ${location.name}`} />

      <div className="vs-card__body">
        <h3 className="vs-card__title">{location.name}</h3>
        <p className="vs-card__meta">
          <Building2 size={13} strokeWidth={1.9} aria-hidden="true" className="vs-ico" />
          {location.building}
          {location.floor ? ` · ${location.floor}` : ''}
        </p>
        <p className="vs-card__text">{location.summary}</p>
        <p className="vs-card__meta" style={{ marginTop: 12 }}>
          <Footprints size={13} strokeWidth={1.9} aria-hidden="true" className="vs-ico" />
          {formatDistance(location.distanceMeters)}
          {walk ? ` · ${walk}` : ''}
        </p>

        <div className="vs-card__foot">
          <Link to={`/visit/explore/${location.id}`} className="lp-btn lp-btn--ghost lp-btn--sm">
            View details <ArrowUpRight size={14} aria-hidden="true" className="vs-arrow" />
          </Link>
          {actions}
        </div>
      </div>
    </article>
  )
}

import { Link, useParams } from 'react-router'
import { ArrowLeft, Building2, Clock, Compass, Footprints } from 'lucide-react'
import { PageHeader } from '../../features/visitor/components/PageHeader'
import { CampusMap } from '../../features/visitor/components/CampusMap'
import { EmptyState, ErrorState, LoadingPanel } from '../../features/visitor/components/States'
import { CATEGORY_LABEL } from '../../features/visitor/visitor-content'
import { useCampusLocation } from '../../features/visitor/visitor-hooks'
import { formatDistance, formatWalk } from '../../features/visitor/visitor-format'

/**
 * One campus place in full.
 *
 * A route rather than a modal, for three reasons: it can be linked to from a
 * notification, it survives a reload, and a modal that holds a photograph, a
 * fact list and a map is a page wearing a costume.
 *
 * The layout is the landing page's overview section (`.lp-ov__grid`): media on
 * one side, the statement and a hairline fact list on the other.
 */
export default function LocationDetailPage() {
  const { locationId = '' } = useParams()
  const query = useCampusLocation(locationId)

  if (query.isPending) {
    return (
      <div className="vs-page">
        <LoadingPanel minHeight={420} />
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="vs-page">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    )
  }

  const location = query.data
  if (!location) {
    return (
      <div className="vs-page">
        <EmptyState
          title="We could not find that place"
          text="It may have been renamed or removed. Try browsing the campus instead."
          icon={<Compass size={22} strokeWidth={1.9} aria-hidden="true" />}
          actions={
            <Link to="/visit/explore" className="lp-btn lp-btn--solid lp-btn--sm">
              Explore campus
            </Link>
          }
        />
      </div>
    )
  }

  const walk = formatWalk(location.walkMinutes)

  return (
    <div className="vs-page vs-stack">
      <Link to="/visit/explore" className="lp-btn lp-btn--ghost lp-btn--sm" style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
        Back to explore
      </Link>

      <PageHeader
        eyebrow={CATEGORY_LABEL[location.category]}
        title={location.name}
        description={location.summary}
        actions={
          <>
            <Link to={`/visit/map?destination=${location.id}`} className="lp-btn lp-btn--ghost lp-btn--sm">
              Directions
            </Link>
            <Link to={`/visit/book?destination=${location.id}`} className="lp-btn lp-btn--solid lp-btn--sm">
              Take me there
            </Link>
          </>
        }
      />

      <div className="vs-split">
        <div className="vs-col">
          <div className="vs-card">
            <div className="vs-card__media" style={{ aspectRatio: '16 / 9' }}>
              <img src={location.imageUrl} alt="" />
            </div>
            <div className="vs-card__body">
              <p className="vs-card__text" style={{ marginTop: 0 }}>
                {location.description}
              </p>
            </div>
          </div>

          {location.highlights.length > 0 && (
            <div className="vs-card vs-card--pad">
              <h2 className="vs-h3">Good to know</h2>
              <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
                {location.highlights.map((item) => (
                  <li
                    key={item}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '18px minmax(0, 1fr)',
                      gap: 10,
                      fontSize: '0.9375rem',
                      lineHeight: 1.6,
                      color: 'var(--lp-ink-2)',
                    }}
                  >
                    <span aria-hidden="true" style={{ color: 'var(--lp-accent)', fontWeight: 700 }}>
                      ·
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="vs-rail">
          <div className="vs-card vs-card--pad">
            <h2 className="vs-h3">Where it is</h2>
            <dl className="vs-facts" style={{ marginTop: 16 }}>
              <div className="vs-fact">
                <dt className="vs-fact__k">
                  <Building2 size={13} strokeWidth={1.9} aria-hidden="true" className="vs-ico" />
                  Building
                </dt>
                <dd className="vs-fact__v">{location.building}</dd>
              </div>
              {location.floor && (
                <div className="vs-fact">
                  <dt className="vs-fact__k">Floor</dt>
                  <dd className="vs-fact__v">{location.floor}</dd>
                </div>
              )}
              <div className="vs-fact">
                <dt className="vs-fact__k">
                  <Footprints size={13} strokeWidth={1.9} aria-hidden="true" className="vs-ico" />
                  Distance
                </dt>
                <dd className="vs-fact__v">
                  {formatDistance(location.distanceMeters)}
                  {walk ? ` · ${walk}` : ''}
                </dd>
              </div>
              <div className="vs-fact">
                <dt className="vs-fact__k">
                  <Clock size={13} strokeWidth={1.9} aria-hidden="true" className="vs-ico" />
                  Open
                </dt>
                <dd className="vs-fact__v">{location.openingHours ?? 'Opening hours not published'}</dd>
              </div>
            </dl>
          </div>

          <CampusMap
            pins={[{ id: location.id, name: location.name, x: location.mapX, y: location.mapY, role: 'destination' }]}
            note="Campus plan preview. Turn-by-turn directions arrive with the campus map service."
          />
        </aside>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Compass, Footprints, MapPin } from 'lucide-react'
import type { LocationCategory } from '../../api/contracts/visitor'
import { PageHeader } from '../../features/visitor/components/PageHeader'
import { SearchBar } from '../../features/visitor/components/SearchBar'
import { CampusMap, MapLegend, type MapPin as Pin } from '../../features/visitor/components/CampusMap'
import { StatusBadge } from '../../features/visitor/components/StatusBadge'
import { RobotMark } from '../../features/visitor/components/RobotMark'
import { ErrorState, LoadingPanel } from '../../features/visitor/components/States'
import { CATEGORY_LABEL, LOCATION_CATEGORIES } from '../../features/visitor/visitor-content'
import { useActiveTour, useCampusLocations } from '../../features/visitor/visitor-hooks'
import { formatDistance, formatWalk } from '../../features/visitor/visitor-format'

/**
 * The campus map.
 *
 * `?destination=<id>` is how Explore and the assistant hand a place over, so a
 * "Directions" button anywhere in the app lands here with the right pin already
 * selected and the link is shareable.
 *
 * The model viewer uses separately surveyed location anchors. Existing plan
 * percentages are only used after a plan-to-model calibration is supplied.
 * Stop order is not a walkable path: never draw a straight line through walls.
 */
export default function CampusMapPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<LocationCategory | undefined>(undefined)

  const filters = useMemo(() => ({ search: search.trim() || undefined, category }), [search, category])
  const locations = useCampusLocations(filters)
  const { data: activeTour } = useActiveTour()

  const destinationId = params.get('destination')
  const all = useCampusLocations()
  const destination = all.data?.find((item) => item.id === destinationId) ?? null

  /**
   * The selected pin is the URL: `?destination=<id>` is what Explore, the
   * assistant and a shared link all set, so the page has nothing of its own to
   * keep in step with it. The one exception is the robot, which is not a
   * destination and cannot be one — selecting it is local, and picking any place
   * afterwards clears it.
   */
  const [robotSelected, setRobotSelected] = useState(false)
  const selected = robotSelected ? 'robot' : destinationId

  const you = all.data?.find((item) => item.distanceMeters === 0) ?? null

  const pins: Pin[] = useMemo(() => {
    const list: Pin[] = (locations.data ?? []).map((location) => ({
      id: location.id,
      name: location.name,
      x: location.mapX,
      y: location.mapY,
      role: location.id === destinationId ? 'destination' : location.id === you?.id ? 'you' : 'place',
    }))

    if (destination && !list.some((pin) => pin.id === destination.id)) {
      list.push({ id: destination.id, name: destination.name, x: destination.mapX, y: destination.mapY, role: 'destination' })
    }

    if (activeTour) {
      list.push({ id: 'robot', name: activeTour.robotName, x: activeTour.robotMapX, y: activeTour.robotMapY, role: 'robot' })
    }

    return list
  }, [locations.data, destination, destinationId, you, activeTour])

  /**
   * The line drawn on the plan.
   *
   * A tour that is running owns the route — those are the stops the robot is
   * actually walking. Otherwise it is the straight line from where the visitor
   * is to the place they picked, which is an honest "this is the direction"
   * rather than a turn-by-turn path the backend cannot yet produce.
   */
  const route = useMemo(() => {
    if (activeTour) return activeTour.stops.map((stop) => ({ x: stop.mapX, y: stop.mapY }))
    if (you && destination) {
      return [
        { x: you.mapX, y: you.mapY },
        { x: destination.mapX, y: destination.mapY },
      ]
    }
    return undefined
  }, [activeTour, you, destination])

  const selectLocation = (id: string) => {
    if (id === 'robot') {
      setRobotSelected(true)
      return
    }
    setRobotSelected(false)
    const next = new URLSearchParams(params)
    next.set('destination', id)
    setParams(next, { replace: true })
  }

  const selectedLocation = all.data?.find((item) => item.id === selected) ?? null

  return (
    <div className="vs-page vs-stack">
      <PageHeader
        eyebrow="Campus map"
        title="Explore campus in 3D"
        description="Take a closer look at the campus. Rotate the model, switch to a top view, or choose a place to plan your visit."
        actions={
          <Link to="/visit/explore" className="lp-btn lp-btn--ghost lp-btn--sm">
            <Compass size={15} strokeWidth={2} aria-hidden="true" />
            Browse places
          </Link>
        }
      />

      <div className="vs-map-workspace" data-visitor-reveal>
      <section aria-label="Map filters" className="vs-card vs-card--pad vs-map-directory">
        <h2 className="vs-h3">Places on campus</h2>
        <SearchBar value={search} onChange={setSearch} label="Search a location" placeholder="Search a location..." />
        <div className="vs-pills" role="group" aria-label="Category">
          {LOCATION_CATEGORIES.map(({ value, label, icon: Icon }) => (
            <button key={label} type="button" className="vs-pill" aria-pressed={category === value} onClick={() => setCategory(value)}>
              <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <div className="vs-map-results" aria-label="Location list" aria-busy={locations.isFetching}>
          {locations.isPending ? <LoadingPanel minHeight={160} /> : locations.isError ? <ErrorState error={locations.error} onRetry={() => void locations.refetch()} /> : locations.data.length === 0 ? <div className="vs-empty"><p className="vs-empty__title">No matching places</p><p className="vs-empty__text">Try another search or category.</p><button type="button" className="lp-btn lp-btn--ghost lp-btn--sm" onClick={() => { setSearch(''); setCategory(undefined) }}>Clear filters</button></div> : locations.data.map((place) => <button key={place.id} type="button" className="vs-map-result" aria-pressed={selected === place.id} onClick={() => selectLocation(place.id)}>
            <img src={place.imageUrl} alt="" loading="lazy" width={48} height={48} />
            <span className="vs-min"><strong>{place.name}</strong><span>{place.building} · {formatDistance(place.distanceMeters)}</span></span><MapPin size={16} aria-hidden="true" />
          </button>)}
        </div>
      </section>

      <div className="vs-col vs-map-content">
        {locations.isPending ? (
          <LoadingPanel minHeight={380} />
        ) : locations.isError ? (
          <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
        ) : (
          <CampusMap
            pins={pins}
            route={route}
            selectedId={selected}
            onSelect={selectLocation}
            note={
              destination
                ? `Route to ${destination.name}. Walking directions arrive with the campus map service.`
                : 'Campus plan. Pick a place to see the way there.'
            }
          >
            <MapLegend />
          </CampusMap>
        )}

        <aside className="vs-map-details">
          {activeTour && (
            <div className="vs-card vs-card--pad">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="vs-choice__icon" aria-hidden="true">
                  <RobotMark size={20} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 className="vs-h3">{activeTour.robotName}</h2>
                  <p className="vs-card__meta">At {activeTour.currentLocationName}</p>
                </div>
              </div>
              <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <StatusBadge value={activeTour.robotState} />
                {activeTour.etaMinutes != null && activeTour.nextDestinationName && (
                  <span className="vs-badge">
                    {activeTour.nextDestinationName} in {activeTour.etaMinutes} min
                  </span>
                )}
              </div>
              <div className="vs-card__foot">
                <Link to="/visit/tour" className="lp-btn lp-btn--solid lp-btn--sm">
                  Open active tour
                </Link>
              </div>
            </div>
          )}

          <div className="vs-card vs-card--pad vs-destination">
            <h2 className="vs-h3">{selectedLocation ? 'Destination' : 'Pick a destination'}</h2>
            {selectedLocation ? (
              <>
                <img className="vs-destination__image" src={selectedLocation.imageUrl} alt="" />
                <p className="vs-card__title" style={{ marginTop: 14 }}>
                  {selectedLocation.name}
                </p>
                <p className="vs-card__meta">
                  {CATEGORY_LABEL[selectedLocation.category]} · {selectedLocation.building}
                  {selectedLocation.floor ? ` · ${selectedLocation.floor}` : ''}
                </p>
                <p className="vs-card__meta" style={{ marginTop: 10 }}>
                  <Footprints size={13} strokeWidth={1.9} aria-hidden="true" className="vs-ico" />
                  {formatDistance(selectedLocation.distanceMeters)}
                  {formatWalk(selectedLocation.walkMinutes) ? ` · ${formatWalk(selectedLocation.walkMinutes)}` : ''}
                </p>
                <div className="vs-card__foot">
                  <Link to={`/visit/explore/${selectedLocation.id}`} className="lp-btn lp-btn--ghost lp-btn--sm">
                    View details
                  </Link>
                  <Link to={`/visit/book?destination=${selectedLocation.id}`} className="lp-btn lp-btn--solid lp-btn--sm">
                    Take me there
                  </Link>
                </div>
              </>
            ) : (
              <p className="vs-card__text">
                <MapPin size={14} strokeWidth={1.9} aria-hidden="true" className="vs-ico" />
                Choose a place from the list, or select a marker on the 3D model, to see details and plan a visit.
              </p>
            )}
          </div>
        </aside>
      </div>
      </div>
    </div>
  )
}

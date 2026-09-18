import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Compass, MapPin } from 'lucide-react'
import type { LocationCategory } from '../../api/contracts/visitor'
import { PageHeader } from '../../features/visitor/components/PageHeader'
import { SectionOpen } from '../../features/visitor/components/SectionOpen'
import { SearchBar } from '../../features/visitor/components/SearchBar'
import { LocationCard } from '../../features/visitor/components/LocationCard'
import { EmptyState, ErrorState, LoadingSkeleton } from '../../features/visitor/components/States'
import { LOCATION_CATEGORIES } from '../../features/visitor/visitor-content'
import { useCampusLocations } from '../../features/visitor/visitor-hooks'

/**
 * Browse the campus.
 *
 * Search and category are UI state, so they live in this component (web/AGENTS.md
 * §1 — Zustand is for state more than one screen shares; this is neither shared
 * nor server data). They are passed to the query as filters, which means the
 * backend does the filtering the day it exists and the mock does it today, with
 * no branch in this file.
 */
export default function ExplorePage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<LocationCategory | undefined>(undefined)

  const filters = useMemo(() => ({ search: search.trim() || undefined, category }), [search, category])
  const locations = useCampusLocations(filters)

  const isFiltered = Boolean(filters.search || filters.category)

  return (
    <div className="vs-page vs-stack vs-stack--editorial">
      <PageHeader
        eyebrow="Explore"
        title="Explore campus"
        description="Every building, lab, canteen and service desk on campus, with how far away it is and how to get there."
        actions={
          <Link to="/visit/map" className="lp-btn lp-btn--ghost lp-btn--sm">
            <MapPin size={15} strokeWidth={2} aria-hidden="true" />
            Open the map
          </Link>
        }
      />

      <section aria-label="Filters" className="vs-filterbar">
        <SearchBar
          value={search}
          onChange={setSearch}
          label="Search campus locations"
          placeholder="Search campus locations..."
        />
        <div className="vs-pills" role="group" aria-label="Category">
          {LOCATION_CATEGORIES.map(({ value, label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              className="vs-pill"
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Campus locations" data-visitor-reveal>
        {locations.isPending ? (
          <LoadingSkeleton rows={6} media />
        ) : locations.isError ? (
          <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
        ) : locations.data.length === 0 ? (
          <EmptyState
            title="Nothing matches that yet"
            text={
              isFiltered
                ? 'Try a different word, or clear the category to see everywhere on campus.'
                : 'No campus locations have been published yet.'
            }
            icon={<Compass size={22} strokeWidth={1.9} aria-hidden="true" />}
            actions={
              isFiltered ? (
                <button
                  type="button"
                  className="lp-btn lp-btn--ghost lp-btn--sm"
                  onClick={() => {
                    setSearch('')
                    setCategory(undefined)
                  }}
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <SectionOpen
              eyebrow={isFiltered ? 'Results' : 'Campus'}
              title={isFiltered ? 'Your search results' : 'Find your next stop'}
              action={
                <p className="lp-meta" role="status">
                  {locations.data.length} {locations.data.length === 1 ? 'place' : 'places'}
                  {locations.isFetching ? ' · updating' : ''}
                </p>
              }
            />
            <div className="vs-grid vs-grid--3">
              {locations.data.map((location) => (
                <LocationCard
                  key={location.id}
                  location={location}
                  actions={
                    <>
                      <Link
                        to={`/visit/map?destination=${location.id}`}
                        className="lp-btn lp-btn--ghost lp-btn--sm"
                      >
                        Directions
                      </Link>
                      <Link
                        to={`/visit/book?destination=${location.id}`}
                        className="lp-btn lp-btn--solid lp-btn--sm"
                      >
                        Book a visit
                      </Link>
                    </>
                  }
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

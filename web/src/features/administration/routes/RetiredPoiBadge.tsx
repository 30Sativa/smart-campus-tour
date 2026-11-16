import { RETIRED_POI_LABEL, retiredPoiChip, retiredPoiTitle } from './retired-poi'
import type { VersionedRoute } from './versioned-api'

/**
 * "Có POI ngưng dùng" on a route revision whose stop POI is retired or discarded (ADR-0062): no new Tour can start on
 * it. The names come from the server; the route detail shows it on the current revision.
 */
export function RetiredPoiBadge({ route }: { route: Pick<VersionedRoute, 'retiredPoiNames'> }) {
  const names = route.retiredPoiNames ?? []
  if (!names.length) return null
  return <span title={retiredPoiTitle(names)}
    className={`inline-flex rounded-full border px-2 py-px text-[11px] font-bold whitespace-nowrap ${retiredPoiChip}`}>
    {RETIRED_POI_LABEL}
  </span>
}

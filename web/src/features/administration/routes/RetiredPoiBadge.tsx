import type { VersionedRoute } from './versioned-api'

/**
 * "Có POI ngưng dùng" on a route revision whose stop POI is retired or discarded (ADR-0062): no new Tour can start on
 * it. The names come from the server; the route list and detail show it on the current revision.
 */
export function RetiredPoiBadge({ route }: { route: Pick<VersionedRoute, 'retiredPoiNames'> }) {
  const names = route.retiredPoiNames ?? []
  if (!names.length) return null
  return <span title={`POI đã ngưng dùng: ${names.join(', ')}`}
    className="inline-flex rounded-full border border-[#f1dcb0] bg-[#fffaf0] px-2 py-px text-[11px] font-bold whitespace-nowrap text-[#7d5310]">
    Có POI ngưng dùng
  </span>
}

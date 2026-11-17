import { Notice } from '../AdminUi'
import { usePoiProposals } from '../../technical/technical-hooks'
import type { VersionedRoute } from './versioned-api'

/**
 * A route stop names the exact POI revision it was tested with (ADR-0061), so a POI that moved on to a newer passed
 * revision does not change the route. Says so on the current route revision, which is the one Staff can edit; nothing
 * is swapped automatically, and a Tour keeps the revision it was created on (ADR-0034).
 */
export function NewerPoiRevisionNotice({ route }: { route: VersionedRoute }) {
  const proposals = usePoiProposals()
  // A hint only: a failed or odd read of the POI list must not take the route page down with it.
  const pois = Array.isArray(proposals.data) ? proposals.data : []
  const names = route.stops.flatMap(stop => {
    const poi = pois.find(proposal => proposal.id === stop.poiProposalId)
    return poi && poi.revision.id !== stop.poiRevisionId && poi.revision.navigationStatus === 'PASS' && poi.revision.mapVersionId === route.mapVersionId
      ? [stop.name] : []
  })
  if (!names.length) return null
  // No button of its own: the page keeps one "Sửa tuyến" button, in its header.
  return <Notice tone="warn">
    POI {names.join(', ')} có phiên bản mới đã đạt. Bấm Sửa tuyến ở đầu trang để dùng bản mới. Đổi vị trí, hướng hoặc camera thì tuyến phải chạy thử lại.
  </Notice>
}

import { Notice } from '../AdminUi'
import { usePoiProposals } from '../../technical/technical-hooks'
import type { VersionedRoute } from './versioned-api'

// The server's PoiNavigationFingerprint fields at its precision, as in the route form: a newer revision that keeps
// them keeps the route's test run.
const navigationKey = (poi: { x: number; y: number; yaw: number; cameraPreset: string }) =>
  [poi.x.toFixed(4), poi.y.toFixed(4), poi.yaw.toFixed(6), poi.cameraPreset.trim().toUpperCase()].join('|')

/**
 * A route stop names the exact POI revision it was tested with (ADR-0061) and a snapshot of the narration approved when
 * it was saved (ADR-0060), so neither a newer passed POI revision nor newly approved wording changes the route. Says so
 * on the current route revision, which is the one Staff can edit; nothing is swapped automatically, and a Tour keeps the
 * revision it was created on (ADR-0034). Stops whose newer revision moved the robot (position, heading or camera) are
 * named apart, since only those need a new route test run; new wording never does.
 */
export function NewerPoiRevisionNotice({ route }: { route: VersionedRoute }) {
  const proposals = usePoiProposals()
  // A hint only: a failed or odd read of the POI list must not take the route page down with it.
  const pois = Array.isArray(proposals.data) ? proposals.data : []
  const moved: string[] = []
  const kept: string[] = []
  for (const stop of route.stops) {
    const poi = pois.find(proposal => proposal.id === stop.poiProposalId)
    if (!poi || poi.revision.id === stop.poiRevisionId || poi.revision.navigationStatus !== 'PASS' || poi.revision.mapVersionId !== route.mapVersionId) continue
    ;(navigationKey(poi.revision) !== navigationKey(stop) ? moved : kept).push(stop.name)
  }
  // The server compares each stop's saved narration version with the POI's approved one; a draft waiting for approval is not counted.
  const narrated = route.stops.filter(stop => stop.newerNarrationRevisionNumber != null).map(stop => stop.name)
  if (!moved.length && !kept.length && !narrated.length) return null
  // No button of its own: the page keeps one "Sửa tuyến" button, in its header.
  return <Notice tone="warn">
    <p>Có POI trong tuyến vừa được cập nhật. Tuyến vẫn dùng bản cũ cho đến khi bạn bấm Sửa tuyến ở đầu trang và lưu lại.</p>
    <ul className="mt-1 list-disc pl-5">
      {moved.length > 0 && <li>{moved.join(', ')}: có phiên bản mới đã đạt, đã đổi vị trí, hướng hoặc camera. Chọn Dùng bản mới thì tuyến phải chạy thử lại.</li>}
      {kept.length > 0 && <li>{kept.join(', ')}: có phiên bản mới đã đạt, vị trí, hướng và camera giữ nguyên. Chọn Dùng bản mới không cần chạy thử lại.</li>}
      {narrated.length > 0 && <li>{narrated.join(', ')}: có lời thuyết minh mới đã duyệt. Lưu lại tuyến để dùng lời mới, không cần chạy thử lại.</li>}
    </ul>
  </Notice>
}

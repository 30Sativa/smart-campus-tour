import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Notice } from '../AdminUi'
import { formatStamp } from '../admin-format'
import { staffRouteStatus } from './route-messages'
import { versionedRoutesApi } from './versioned-api'

/**
 * A Tour runs the exact route revision it was created on (ADR-0034); saving the route makes a new revision and leaves
 * the Tour as it was. Says so on a Tour still to run whose route has moved on, because its stop list alone reads as
 * "the route". A new revision with the Tour's path and only newer narration can be taken from the Tour page
 * (ADR-0067); any other change means cancelling the Tour and creating it again. Recreating
 * is advised only when the new revision has another path and can take a new Tour; a pass recorded on the Tour's own
 * path unblocks it without that.
 */
export function NewerRevisionNotice({ routeId, revisionId, tourRevisionFailed = false, narrationRefreshable = false }: { routeId: string; revisionId: string; tourRevisionFailed?: boolean
  /** ADR-0067: the newer revision has the Tour's path and only newer narration, which the Tour can take without being recreated. */
  narrationRefreshable?: boolean }) {
  const current = useQuery({ queryKey: ['versioned-routes', routeId], queryFn: () => versionedRoutesApi.get(routeId) })
  // Only an answer naming a revision says anything; a failed or odd read must not take the Tour page down with it.
  const latest = current.data
  if (typeof latest?.revisionId !== 'string' || latest.revisionId === revisionId) return null
  const savedAt = latest.revisionHistory?.find(item => item.revisionId === latest.revisionId)?.createdAt
  const status = staffRouteStatus(latest).label.toLowerCase()
  // ADR-0023 addendum: a save with the same path shares the Tour's result, so recreating the Tour on it changes nothing.
  const samePath = Boolean(latest.sharedResultRevisions?.some(item => item.revisionId === revisionId))
  // ADR-0062: a new Tour is refused on a save with a retired POI, so recreating helps only when the new save is usable.
  const latestRetired = Boolean(latest.retiredPoiNames?.length)
  const latestUsable = latest.verificationStatus === 'PASS' && !latestRetired
  const advice = narrationRefreshable && !tourRevisionFailed
    ? 'Bản mới có cùng đường đi, chỉ khác lời thuyết minh: bấm "Cập nhật lời thuyết minh mới" ở mục Lời thuyết minh, không cần tạo lại Tour.'
    : tourRevisionFailed
    ? samePath ? 'Khi Kỹ thuật ghi một lần chạy đạt cho đường đi này, Tour chốt được lại, không cần tạo lại Tour.'
      : latestUsable ? 'Bản mới có đường đi khác và đã chạy thử đạt: muốn Tour đi theo bản mới, hủy Tour rồi tạo lại. Hoặc giữ Tour và chờ Kỹ thuật ghi một lần chạy đạt cho đường đi của bản Tour đang dùng.'
        : 'Khi Kỹ thuật ghi một lần chạy đạt cho đường đi của bản Tour đang dùng, Tour chốt được lại, không cần tạo lại Tour.'
    : latestUsable ? 'Muốn Tour đi theo bản mới, hủy Tour rồi tạo lại.'
    : latestRetired ? 'Bản mới cũng có POI đã ngưng dùng nên chưa tạo lại Tour theo bản này được. Dùng lại POI, hoặc lưu một bản tuyến không có POI đó và chờ bản ấy chạy thử đạt, rồi hủy Tour và tạo lại.'
    : 'Muốn Tour đi theo bản mới, chờ bản mới chạy thử đạt rồi hủy Tour và tạo lại.'
  return <div className="mt-3"><Notice tone="warn" action={<Link to={`/staff/manage/routes/${routeId}`} className="text-sm whitespace-nowrap text-[#2d719e] hover:underline">Xem bản mới</Link>}>
    Tuyến đã có bản mới{savedAt ? ` lưu ${formatStamp(savedAt)}` : ''}, {status}. {tourRevisionFailed
      ? 'Tour này gắn với bản đã chọn lúc tạo, và bản đó đang có kết quả chạy thử không đạt nên chưa chốt hay bắt đầu được.'
      : 'Tour này vẫn chạy bản đã chọn lúc tạo, với các điểm dừng bên dưới.'}
    {' '}{advice}
  </Notice></div>
}

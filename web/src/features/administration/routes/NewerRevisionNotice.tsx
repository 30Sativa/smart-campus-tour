import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Notice } from '../AdminUi'
import { formatStamp } from '../admin-format'
import { staffRouteStatus } from './route-messages'
import { versionedRoutesApi } from './versioned-api'

/**
 * A Tour runs the exact route revision it was created on (ADR-0034); saving the route makes a new revision and leaves
 * the Tour as it was. Says so on a Tour still to run whose route has moved on, because its stop list alone reads as
 * "the route", and a Tour cannot be moved to the new revision: it has to be cancelled and created again.
 */
export function NewerRevisionNotice({ routeId, revisionId }: { routeId: string; revisionId: string }) {
  const current = useQuery({ queryKey: ['versioned-routes', routeId], queryFn: () => versionedRoutesApi.get(routeId) })
  // Only an answer naming a revision says anything; a failed or odd read must not take the Tour page down with it.
  const latest = current.data
  if (typeof latest?.revisionId !== 'string' || latest.revisionId === revisionId) return null
  const savedAt = latest.revisionHistory?.find(item => item.revisionId === latest.revisionId)?.createdAt
  const status = staffRouteStatus(latest).label.toLowerCase()
  return <div className="mt-3"><Notice tone="warn" action={<Link to={`/staff/manage/routes/${routeId}`} className="text-sm whitespace-nowrap text-[#2d719e] hover:underline">Xem bản mới</Link>}>
    Tuyến đã có bản mới{savedAt ? ` lưu ${formatStamp(savedAt)}` : ''}, {status}. Tour này vẫn chạy bản đã chọn lúc tạo, với các điểm dừng bên dưới.
    Muốn Tour đi theo bản mới, {latest.verificationStatus === 'PASS' ? 'hủy Tour rồi tạo lại' : 'chờ bản mới chạy thử đạt rồi hủy Tour và tạo lại'}.
  </Notice></div>
}

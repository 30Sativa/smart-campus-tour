import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { LoadingPanel, PageHeader, panelClass, PanelHead } from '../../components/ui/ConsolePrimitives'
import { KpiRow, KpiTile } from '../../components/ui/Charts'
import { formatDateTime, formatMinutesSeconds, formatTime } from '../../components/ui/date-time'
import { EmptyState } from '../../components/ui/EmptyState'
import { buttonClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { TOUR_STATE_LABEL } from '../../features/administration/tours/tour-messages'
import { useTourEngagement } from '../../features/staff/engagement/engagement-api'
import { AudiencePanel, PRIVACY_NOTE, SignalTags } from '../../features/staff/engagement/EngagementParts'
import { percent, STOP_OUTCOME_LABEL } from '../../features/staff/engagement/engagement-labels'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'

/** ADR-0071: one Tour, stop by stop: where viewers asked, voted and left. */
export default function TourEngagementPage() {
  const { tourId = '' } = useParams()
  const report = useTourEngagement(tourId)
  const back = <Link to="/staff/engagement" className={`${buttonClass('ghost', 'sm')} -ml-2`}><ArrowLeft size={15} aria-hidden="true" />Phân tích tương tác</Link>

  if (report.isPending) return <StaffPage><LoadingPanel label="Đang tổng hợp tương tác…" /></StaffPage>
  if (report.isError) return <StaffPage><div className="mb-4">{back}</div><ErrorPanel error={report.error} onRetry={() => void report.refetch()} /></StaffPage>
  const data = report.data

  const accepted = data.audience.reduce((sum, segment) => sum + segment.acceptedRows, 0)
  const joined = data.audience.reduce((sum, segment) => sum + segment.joinedRows, 0)
  const state = TOUR_STATE_LABEL[data.state as keyof typeof TOUR_STATE_LABEL] ?? data.state

  return (
    <StaffPage>
      <PageHeader eyebrow="Lịch sử" back={{ to: '/staff/engagement', label: 'Phân tích tương tác' }} title={data.name}
        description={`${state}${data.routeName ? ` · ${data.routeName}` : ''} · bắt đầu ${formatDateTime(data.startedAt ?? data.scheduledStartAt)}`}
        action={<Link to={`/staff/manage/tours/${data.tourId}`} className={buttonClass('secondary', 'sm')}>Chi tiết Tour</Link>} />
      <p className="mb-4 text-xs text-muted">{PRIVACY_NOTE}{data.state === 'RUNNING' ? ' Buổi đang chạy: số liệu cập nhật mỗi 30 giây.' : ''}</p>

      <KpiRow label="Tổng hợp buổi">
        <KpiTile label="Đã vào xem" value={`${joined}/${accepted}`} note={percent(joined, accepted)} />
        <KpiTile label="Câu hỏi AI" value={data.questions.total} note={`${data.questions.atStops} tại điểm dừng, ${data.questions.waitingRoom} ở phòng chờ`} />
        <KpiTile label="Ngoài phạm vi" value={data.questions.outOfScope} note="câu AI không trả lời theo nội dung trường" />
        <KpiTile label="Rời giữa buổi" value={data.viewersLeftDuringTour} tone={data.viewersLeftDuringTour > 0 ? 'warn' : 'plain'} note="lượt rời khi Tour đang chạy" />
      </KpiRow>

      <AudiencePanel audience={data.audience} />

      <section className={`${panelClass} mt-4`} aria-label="Theo điểm dừng">
        <PanelHead title="Theo điểm dừng" description="Theo thứ tự của tuyến. Bầu chọn là số phiếu chọn điểm này làm điểm tiếp theo." />
        {data.stops.length === 0 ? <EmptyState variant="empty" title="Buổi này không chạy trên phiên bản tuyến nên chưa có số liệu theo điểm dừng." />
          : <div className="overflow-x-auto"><table className="w-full text-left" aria-label="Tương tác theo điểm dừng">
            <thead className="border-b border-[#e2e8f0]"><tr>
              {['Điểm dừng', 'Trạng thái', 'Đến lúc', 'Dừng thực tế', 'Câu hỏi', 'Bỏ phiếu tại đây', 'Được bầu', 'Rời buổi', 'Nhận xét'].map(label =>
                <th key={label} scope="col" className={thClass}>{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-[#eef1f4]">{data.stops.map(stop => (
              <tr key={stop.stopId} className={rowClass}>
                <th scope="row" className={`${tdClass} font-semibold text-[#0f172a]`}>
                  <span className="mr-1.5 text-muted tabular-nums">{stop.plannedOrder}.</span>{stop.name}
                </th>
                <td className={tdClass}>{STOP_OUTCOME_LABEL[stop.outcome]}{stop.visitOrder != null && stop.visitOrder !== stop.plannedOrder &&
                  <span className="block text-xs text-muted">đến thứ {stop.visitOrder}</span>}</td>
                <td className={`${tdClass} tabular-nums`}>{stop.arrivedAt ? formatTime(stop.arrivedAt) : '-'}</td>
                <td className={`${tdClass} whitespace-nowrap tabular-nums`}>{formatMinutesSeconds(stop.actualDwellSeconds)}
                  <span className="text-muted"> / {formatMinutesSeconds(stop.plannedDwellSeconds)}</span></td>
                <td className={`${tdClass} tabular-nums`}>{stop.questions}</td>
                <td className={`${tdClass} tabular-nums`}>{stop.ballotVoters}</td>
                <td className={`${tdClass} tabular-nums`}>{stop.votesReceived}</td>
                <td className={`${tdClass} tabular-nums`}>{stop.viewersLeft}</td>
                <td className={tdClass}><SignalTags signals={stop.signals} /></td>
              </tr>
            ))}</tbody>
          </table></div>}
      </section>
    </StaffPage>
  )
}

import { useState } from 'react'
import { Link } from 'react-router'
import { FilterChips, LoadingPanel, PageHeader, panelClass, PanelHead } from '../../components/ui/ConsolePrimitives'
import { KpiRow, KpiTile } from '../../components/ui/Charts'
import { formatDateTime, formatMinutesSeconds } from '../../components/ui/date-time'
import { EmptyState } from '../../components/ui/EmptyState'
import { rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { TOUR_STATE_LABEL } from '../../features/administration/tours/tour-messages'
import { useEngagementOverview } from '../../features/staff/engagement/engagement-api'
import { AudiencePanel, PRIVACY_NOTE, SignalTags } from '../../features/staff/engagement/EngagementParts'
import { decimal, percent, rate, SIGNAL, SIGNAL_TONE_CLASS, suggestions } from '../../features/staff/engagement/engagement-labels'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'

const PERIODS = [
  { value: '7', label: '7 ngày' },
  { value: '30', label: '30 ngày' },
  { value: '90', label: '90 ngày' },
  { value: '365', label: '12 tháng' },
] as const
type Period = (typeof PERIODS)[number]['value']

/** The period ends now and starts that many days earlier; fixed when chosen, so the query key does not move every render. */
function range(days: Period, now = Date.now()) {
  return { from: new Date(now - Number(days) * 86_400_000).toISOString(), to: new Date(now).toISOString() }
}

/** ADR-0071: how viewers took part in ended Tours, per POI, with what to improve first. */
export default function EngagementPage() {
  const [period, setPeriod] = useState<Period>('30')
  const [{ from, to }, setRange] = useState(() => range('30'))
  const report = useEngagementOverview(from, to)

  return (
    <StaffPage>
      <PageHeader eyebrow="Lịch sử" title="Phân tích tương tác"
        description="Người xem tham gia các buổi đã kết thúc ra sao: ai vào xem, bầu chọn, hỏi AI và rời buổi ở điểm nào, để cải thiện tuyến." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterChips label="Khoảng thời gian" value={period} options={[...PERIODS]}
          onChange={value => { setPeriod(value as Period); setRange(range(value as Period)) }} />
        <p className="text-xs text-muted">{PRIVACY_NOTE}</p>
      </div>

      {report.isPending ? <LoadingPanel label="Đang tổng hợp tương tác…" />
        : report.isError ? <ErrorPanel error={report.error} onRetry={() => void report.refetch()} />
        : report.data.tourCount === 0 ? <section className={panelClass}><EmptyState variant="empty" title="Chưa có buổi nào kết thúc trong khoảng này."
          description="Số liệu xuất hiện sau khi một Tour đã bắt đầu và kết thúc." /></section>
        : <>
          <KpiRow label="Tổng hợp tương tác">
            <KpiTile label="Buổi đã kết thúc" value={report.data.tourCount} note={report.data.truncated ? 'chỉ tính các buổi gần nhất' : undefined} />
            <KpiTile label="Tỷ lệ vào xem" value={rate(report.data.joinRate)} note="dòng mời đã mở Tour" />
            <KpiTile label="Câu hỏi AI mỗi buổi" value={decimal(report.data.questionsPerTour)} note={`${report.data.questions.total} câu, ${report.data.questions.waitingRoom} ở phòng chờ`} />
            <KpiTile label="Rời giữa buổi" value={report.data.tours.reduce((sum, tour) => sum + tour.viewersLeft, 0)} note="lượt rời khi Tour đang chạy"
              tone={report.data.tours.some(tour => tour.viewersLeft > 0) ? 'warn' : 'plain'} />
          </KpiRow>

          <Suggestions pois={report.data.pois} />

          <div className="mt-4"><AudiencePanel audience={report.data.audience} /></div>

          <section className={`${panelClass} mt-4`} aria-label="Tương tác theo POI">
            <PanelHead title="Tương tác theo POI" description="Sắp xếp theo số câu hỏi mỗi lượt đến. Thời gian dừng là trung bình thực tế so với kế hoạch." />
            {report.data.pois.length === 0 ? <EmptyState variant="empty" title="Các buổi trong khoảng này chưa đi qua POI nào." />
              : <div className="overflow-x-auto"><table className="w-full text-left" aria-label="Tương tác theo POI">
                <thead className="border-b border-[#e2e8f0]"><tr>
                  {['POI', 'Lượt đến', 'Câu hỏi', 'Hỏi/lượt', 'Dừng thực tế', 'Được bầu', 'Rời buổi', 'Nhận xét'].map(label => <th key={label} scope="col" className={thClass}>{label}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-[#eef1f4]">{report.data.pois.map(poi => (
                  <tr key={poi.poiId} className={rowClass}>
                    <th scope="row" className={`${tdClass} font-semibold text-[#0f172a]`}>{poi.name}</th>
                    <td className={`${tdClass} tabular-nums`}>{poi.visits}{poi.skips > 0 && <span className="text-muted"> (bỏ qua {poi.skips})</span>}</td>
                    <td className={`${tdClass} tabular-nums`}>{poi.questions}</td>
                    <td className={`${tdClass} tabular-nums`}>{decimal(poi.questionsPerVisit)}</td>
                    <td className={`${tdClass} whitespace-nowrap tabular-nums`}>{formatMinutesSeconds(poi.averageDwellSeconds)}
                      <span className="text-muted"> / {formatMinutesSeconds(poi.averagePlannedDwellSeconds)}</span></td>
                    <td className={`${tdClass} tabular-nums`}>{poi.votesReceived}</td>
                    <td className={`${tdClass} tabular-nums`}>{poi.viewersLeft}</td>
                    <td className={tdClass}><SignalTags signals={poi.signals} /></td>
                  </tr>
                ))}</tbody>
              </table></div>}
          </section>

          <section className={`${panelClass} mt-4`} aria-label="Từng buổi">
            <PanelHead title="Từng buổi" description="Mở một buổi để xem tương tác ở từng điểm dừng." />
            <div className="overflow-x-auto"><table className="w-full text-left" aria-label="Tương tác từng buổi">
              <thead className="border-b border-[#e2e8f0]"><tr>
                {['Tour', 'Bắt đầu', 'Kết quả', 'Vào xem', 'Câu hỏi', 'Rời buổi'].map(label => <th key={label} scope="col" className={thClass}>{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-[#eef1f4]">{report.data.tours.map(tour => (
                <tr key={tour.tourId} className={rowClass}>
                  <td className={tdClass}>
                    <Link to={`/staff/engagement/${tour.tourId}`} className="font-semibold text-[#0f172a] hover:text-[#2d719e] hover:underline">{tour.name}</Link>
                    {tour.routeName && <span className="block text-xs text-muted">{tour.routeName}</span>}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap`}>{formatDateTime(tour.startedAt)}</td>
                  <td className={tdClass}>{TOUR_STATE_LABEL[tour.state as keyof typeof TOUR_STATE_LABEL] ?? tour.state}</td>
                  <td className={`${tdClass} tabular-nums`}>{tour.joinedRows}/{tour.acceptedRows} <span className="text-muted">({percent(tour.joinedRows, tour.acceptedRows)})</span></td>
                  <td className={`${tdClass} tabular-nums`}>{tour.questions}</td>
                  <td className={`${tdClass} tabular-nums`}>{tour.viewersLeft}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </section>
        </>}
    </StaffPage>
  )
}

function Suggestions({ pois }: { pois: Parameters<typeof suggestions>[0] }) {
  const items = suggestions(pois)
  return (
    <section className={panelClass} aria-label="Gợi ý cải thiện tuyến">
      <PanelHead title="Gợi ý cải thiện tuyến" description="Rút ra từ số liệu của khoảng đã chọn; cần người phụ trách tuyến xem lại trước khi sửa." />
      {items.length === 0 ? <p className="px-3.5 py-3 text-sm text-muted">Chưa có điểm nào nổi bật. Cần thêm buổi để so sánh.</p>
        : <ul className="grid gap-2 px-3.5 py-3">{items.map(item => (
          <li key={`${item.poi}-${item.signal}`} className="flex flex-wrap items-start gap-2 text-sm text-[#334155]">
            <span className={`rounded-md border px-1.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap ${SIGNAL_TONE_CLASS[SIGNAL[item.signal].tone]}`}>{SIGNAL[item.signal].label}</span>
            <span className="min-w-0 flex-1"><b className="font-semibold text-[#0f172a]">{item.poi}</b>: {item.advice}</span>
          </li>
        ))}</ul>}
    </section>
  )
}

import { Link } from 'react-router'
import { CheckCheck, FileUp, Map, MapPin, Upload } from 'lucide-react'
import { LoadingPanel, PageHeader, SectionHeading, StatStrip, StatTile, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { useTechnicalActivity, useTechnicalData } from '../../features/technical/technical-hooks'
import { mapPipeline, stamp } from '../../features/technical/technical-format'
import { PipelineChips, RouteBoard, TechnicalPage } from '../../features/technical/TechnicalUi'

/** Where a Technical Staff member starts: what blocks scheduling, and how far each map version has come. */
export default function TechnicalOverviewPage() {
  const { pending, maps, pois, routes } = useTechnicalData()
  const activity = useTechnicalActivity()
  const onRobot = maps.find((map) => map.onRobot)
  const openPois = pois.filter((poi) => poi.state !== 'VERIFIED')
  const blocked = routes.filter((route) => route.state === 'NEEDS_RECONFIRM')
  const waiting = maps.filter((map) => !map.deployedAt)

  return (
    <TechnicalPage>
      <PageHeader
        eyebrow="Kỹ thuật"
        title="Tổng quan kỹ thuật"
        description="Việc đang chặn xếp lịch và tiến độ của từng version map: upload, deploy, localization, xác minh POI, xác nhận tuyến."
        action={<div className="flex flex-wrap gap-2"><Link to="/technical/poi-import" className={buttonClass('secondary')}><FileUp size={16} aria-hidden="true" />Import POI</Link><Link to="/technical/maps?upload=1" className={buttonClass('primary')}><Upload size={16} aria-hidden="true" />Upload version map</Link></div>}
      />
      {pending ? <LoadingPanel label="Đang tải dữ liệu kỹ thuật…" /> : (
        <div className="space-y-7">
          <StatStrip label="Tóm tắt kỹ thuật" columns="sm:grid-cols-2 xl:grid-cols-4">
            <StatTile icon={Map} label="Map đang chạy trên robot" value={onRobot?.mapKey ?? '—'} hint={onRobot?.localization ? (onRobot.localization.passed ? 'Localization đạt' : 'Localization không đạt') : 'Chưa đo localization'} to={onRobot ? `/technical/maps/${onRobot.mapKey}` : undefined} />
            <StatTile icon={MapPin} label="POI chờ xác minh" value={openPois.length} hint={`${openPois.filter((poi) => poi.state === 'FAILED').length} lần trước không đạt`} tone="warn" to="/technical/pois" />
            <StatTile icon={CheckCheck} label="Tuyến bị chặn xếp lịch" value={blocked.length} hint={blocked.length ? 'Cần xác nhận lại' : 'Không có'} tone="danger" to="/technical/confirmations" />
            <StatTile icon={Upload} label="Version chờ deploy" value={waiting.length} hint={`${maps.length} version đã đăng ký`} tone="warn" to="/technical/maps" />
          </StatStrip>

          <section>
            <SectionHeading title="Tiến trình theo version map" action={<Link to="/technical/maps" className="text-[13px] font-semibold text-[#2d719e] hover:underline">Tất cả version</Link>} />
            <div className={`${panelClass} divide-y divide-[#f1f5f9]`}>
              {maps.map((map) => (
                <div key={map.mapKey} className={`flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4 ${map.onRobot ? 'bg-[#f1f8fe]' : ''}`}>
                  <div className="w-36 shrink-0">
                    <Link to={`/technical/maps/${map.mapKey}`} className="font-mono font-semibold text-[#0f172a] hover:text-[#2d719e]">{map.mapKey}</Link>
                    <p className="text-xs text-[#64748b]">{map.onRobot ? 'đang chạy trên robot' : map.deployedAt ? 'đã deploy trước đó' : 'mới upload'}</p>
                  </div>
                  <PipelineChips steps={mapPipeline(map, pois, routes)} />
                  <Link to={`/technical/maps/${map.mapKey}`} className={buttonClass('secondary', 'sm')}>Mở</Link>
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionHeading title="Xác nhận tuyến" note="Staff chỉ xếp lịch được version đã xác nhận" action={<Link to="/technical/confirmations" className="text-[13px] font-semibold text-[#2d719e] hover:underline">Mở trang tuyến</Link>} />
            <RouteBoard routes={routes} />
          </section>

          <section>
            <SectionHeading title="Hoạt động gần đây" action={<Link to="/technical/activity" className="text-[13px] font-semibold text-[#2d719e] hover:underline">Nhật ký</Link>} />
            <ul className={`${panelClass} divide-y divide-[#f1f5f9]`}>
              {(activity.data ?? []).slice(0, 5).map((entry) => (
                <li key={entry.id} className="flex gap-4 px-5 py-3 text-[13px]">
                  <span className="w-24 shrink-0 text-[#64748b] tabular-nums">{stamp(entry.at)}</span>
                  <span className="min-w-0"><span className="font-semibold text-[#0f172a]">{entry.action}</span> · {entry.target}<span className="block text-xs text-[#64748b]">{entry.by}{entry.note ? ` · ${entry.note}` : ''}</span></span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </TechnicalPage>
  )
}

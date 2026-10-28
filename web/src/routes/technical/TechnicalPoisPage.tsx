import { Link, useSearchParams } from 'react-router'
import { FileUp } from 'lucide-react'
import { LoadingPanel, PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../components/ui/ui-classes'
import { Drawer } from '../../features/administration/components/Drawer'
import { useTechnicalData } from '../../features/technical/technical-hooks'
import { POI_SOURCE, POI_STATE } from '../../features/technical/technical-format'
import { ChoiceGroup, Notice, TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { MapLegend, TechnicalMap } from '../../features/technical/TechnicalMap'
import { PoiCheckForm } from '../../features/technical/PoiCheckForm'
import type { PoiCheckState } from '../../features/technical/types'

type Filter = 'ALL' | PoiCheckState
const FILTERS: { value: Filter; label: string }[] = [{ value: 'ALL', label: 'Tất cả' }, { value: 'PENDING', label: 'Chờ' }, { value: 'VERIFIED', label: 'Đã xác minh' }, { value: 'FAILED', label: 'Không đạt' }]

/**
 * POIs per map version. Staff only proposes a POI; a Technical Staff member
 * goes to the spot, checks the robot reaches it, picks the camera angle and
 * records the result. State lives in the URL so a route page can link here.
 */
export default function TechnicalPoisPage() {
  const { pending, maps, pois } = useTechnicalData()
  const [params, setParams] = useSearchParams()
  const mapKey = params.get('map') ?? maps.find((map) => map.onRobot)?.mapKey ?? maps[0]?.mapKey ?? ''
  const filter = (params.get('state') as Filter | null) ?? 'ALL'
  const selectedId = params.get('poi')
  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) { if (value == null) next.delete(key); else next.set(key, value) }
    setParams(next, { replace: true })
  }

  const map = maps.find((item) => item.mapKey === mapKey)
  const own = pois.filter((poi) => poi.mapKey === mapKey)
  const shown = own.filter((poi) => filter === 'ALL' || poi.state === filter)
  const selected = pois.find((poi) => poi.id === selectedId)

  return (
    <TechnicalPage>
      <PageHeader eyebrow="POI" title="Xác minh POI" description="Staff chỉ đề xuất POI. Nhân viên kỹ thuật ra tận nơi kiểm tra robot tới đúng chỗ, chọn góc camera rồi ghi kết quả."
        action={<Link to="/technical/poi-import" className={buttonClass('secondary')}><FileUp size={16} aria-hidden="true" />Import YAML</Link>} />
      {pending ? <LoadingPanel label="Đang tải POI…" /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="w-48"><span className="mb-1.5 block text-[13px] font-medium text-[#334155]">Version map</span>
              <select className={inputClass} value={mapKey} onChange={(event) => update({ map: event.target.value, poi: null })}>{maps.map((item) => <option key={item.mapKey} value={item.mapKey}>{item.mapKey}</option>)}</select>
            </label>
            <ChoiceGroup name="poi-filter" label="Trạng thái" value={filter} options={FILTERS} onChange={(value) => update({ state: value === 'ALL' ? null : value })} />
          </div>
          {map && !map.localization?.passed && <Notice tone="warn">{map.mapKey} chưa đạt localization. Đo localization ở <Link to={`/technical/maps/${map.mapKey}`} className="font-semibold underline">trang version map</Link> trước khi xác minh POI.</Notice>}
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,1fr)]">
            <section className={panelClass} aria-label="Bản đồ POI">
              <PanelHead title={`Bản đồ ${mapKey}`} description="Bấm một điểm để xác minh" action={<MapLegend />} />
              <div className="p-5"><TechnicalMap mapKey={mapKey} pois={shown} frame={own} selectedId={selectedId} onSelect={(id) => update({ poi: id })} /></div>
            </section>
            <section className={panelClass} aria-label="Danh sách POI">
              <PanelHead title="Danh sách" description={`${own.filter((poi) => poi.state === 'VERIFIED').length}/${own.length} đã xác minh`} />
              {shown.length ? (
                <ul className="divide-y divide-[#f1f5f9]">
                  {shown.map((poi) => (
                    <li key={poi.id}>
                      <button type="button" onClick={() => update({ poi: poi.id })} aria-pressed={poi.id === selectedId} className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b9dc9] ${poi.id === selectedId ? 'bg-[#f1f8fe]' : ''}`}>
                        <span className="min-w-0 flex-1"><span className="block font-semibold text-[#0f172a]">{poi.name}</span><span className="block text-xs text-[#64748b]">x {poi.x} · y {poi.y} · {POI_SOURCE[poi.source]}{poi.cameraAngle ? ` · ${poi.cameraAngle}` : ''}</span></span>
                        <ToneBadge tone={POI_STATE[poi.state].tone}>{POI_STATE[poi.state].label}</ToneBadge>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="px-5 py-6 text-center text-[13px] text-[#64748b]">Không có POI phù hợp bộ lọc.</p>}
            </section>
          </div>
        </div>
      )}
      <Drawer open={!!selected} title={selected?.name ?? ''} description={selected ? `Xác minh tại chỗ · ${selected.mapKey}` : undefined} onClose={() => update({ poi: null })}>
        {selected && <PoiCheckForm key={selected.id} poi={selected} map={maps.find((item) => item.mapKey === selected.mapKey)} onDone={() => update({ poi: null })} />}
      </Drawer>
    </TechnicalPage>
  )
}

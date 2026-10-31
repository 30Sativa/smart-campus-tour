import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MapPinned, MapPinOff } from 'lucide-react'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { AdminPage, Notice } from '../../../features/administration/AdminUi'
import { celebrate, notify } from '../../../components/ui/toast-store'
import { technicalApi, type PoiProposal } from '../../../features/technical/api/technical'
import { errorText } from '../../../features/technical/technical-format'
import { useMapVersions } from '../../../features/technical/technical-hooks'
import { cameraPresetLabel, mapCheckLabel, poiStatus } from '../../../features/technical/poi-labels'
import { PoiPosePicker, type PickerMode, type PickerPose } from '../../../features/administration/pois/map/PoiPosePicker'
import { parseVersionedMapPackage, rasterPngBlob } from '../../../features/administration/pois/map/versioned-package'
import type { OccupancyMap } from '../../../features/administration/pois/map/catalog'

type Draft = { mapVersionId: string; name: string; purpose: string; description: string; narrationText: string; fallbackVideoUrl: string; x: number | null; y: number | null; yaw: number | null; cameraPreset: string }
const empty: Draft = { mapVersionId: '', name: '', purpose: '', description: '', narrationText: '', fallbackVideoUrl: '', x: null, y: null, yaw: null, cameraPreset: 'FRONT' }

function asDraft(item: PoiProposal): Draft {
  const { revision } = item
  return { mapVersionId: revision.mapVersionId, name: revision.name, purpose: revision.purpose, description: revision.description ?? '', narrationText: revision.narrationText ?? '', fallbackVideoUrl: revision.fallbackVideoUrl ?? '', x: revision.x, y: revision.y, yaw: revision.yaw, cameraPreset: revision.cameraPreset }
}

export default function StaffManagePoiFormPage() {
  const { poiId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const maps = useMapVersions()
  const proposalQuery = useQuery({ queryKey: ['technical', 'poi-proposal', poiId], queryFn: () => technicalApi.getPoiProposal(poiId!), enabled: Boolean(poiId) })
  const [draftOverride, setDraftOverride] = useState<Draft | null>(null)
  const [saved, setSaved] = useState<PoiProposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [poseMode, setPoseMode] = useState<PickerMode>('position')
  const [mapState, setMapState] = useState<{ id: string; map: OccupancyMap; url: string } | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const current = saved ?? proposalQuery.data ?? null
  const draft = draftOverride ?? (proposalQuery.data ? asDraft(proposalQuery.data) : empty)
  const mapMissingFromList = Boolean(poiId && current && !maps.data?.some(item => item.map.id === current.revision.mapVersionId))
  const mapDetailsQuery = useQuery({
    queryKey: ['technical', 'map', current?.revision.mapVersionId],
    queryFn: () => technicalApi.getMap(current!.revision.mapVersionId),
    enabled: mapMissingFromList,
  })
  const selectedItem = maps.data?.find(item => item.map.id === draft.mapVersionId)
    ?? (mapDetailsQuery.data?.map.id === draft.mapVersionId ? mapDetailsQuery.data : undefined)
  const eligibleMaps = (maps.data ?? []).filter(item => item.canUseForPoiPreparation)
  const pickerMap = mapState?.id === draft.mapVersionId ? mapState.map : null
  const mapEligible = Boolean(selectedItem?.canUseForPoiPreparation)
  const historicalReadOnly = Boolean(current && selectedItem && !mapEligible)
  const pose: PickerPose = { x: draft.x, y: draft.y, yaw: draft.yaw }

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    if (!selectedItem) return
    void (async () => {
      try {
        const bytes = await technicalApi.getMapPackage(selectedItem.map.id)
        const raster = await parseVersionedMapPackage(await bytes.arrayBuffer(), selectedItem.map.imageFileName)
        const blob = await rasterPngBlob(raster)
        objectUrl = URL.createObjectURL(blob)
        const map: OccupancyMap = { schemaVersion: 1, mapKey: selectedItem.map.mapKey, frameId: selectedItem.map.frameId,
          imageUrl: objectUrl, imageSha256: raster.imageSha256, fingerprint: selectedItem.map.packageSha256,
          sourceYaml: raster.sourceYaml, width: raster.width, height: raster.height, resolution: raster.resolution, origin: raster.origin }
        if (active) { setMapState({ id: selectedItem.map.id, map, url: objectUrl }); setMapError(null) }
      } catch (cause) { if (active) setMapError(cause instanceof Error ? cause.message : 'Không tải được package map.') }
    })()
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [selectedItem])

  const history = useQuery({ queryKey: ['technical', 'poi-history', poiId], queryFn: () => technicalApi.getPoiHistory(poiId!), enabled: Boolean(poiId) })
  const update = (values: Partial<Draft>) => { setDraftOverride(value => ({ ...draft, ...value, ...values })); setError(null) }
  const mutate = async (action: 'save' | 'submit') => {
    if (!mapEligible || historicalReadOnly || !draft.mapVersionId || !draft.name.trim() || !draft.purpose.trim() || !draft.narrationText.trim() || draft.x == null || draft.y == null || draft.yaw == null) {
      setError('Cần chọn bản đồ, nhập tên, mục đích, nội dung thuyết minh và đặt vị trí cùng hướng trên bản đồ.')
      return
    }
    const body = { ...draft, x: draft.x!, y: draft.y!, yaw: draft.yaw!, name: draft.name.trim(), purpose: draft.purpose.trim(), description: draft.description.trim() || null, narrationText: draft.narrationText.trim(), fallbackVideoUrl: draft.fallbackVideoUrl.trim() || null }
    setBusy(true); setError(null)
    try {
      let result = current
      const created = !result
      if (result) result = await technicalApi.revisePoiProposal(result.id, result, body)
      else result = await technicalApi.createPoiProposal(body)
      setSaved(result)
      await queryClient.invalidateQueries({ queryKey: ['technical', 'poi-proposals'] })
      if (action === 'submit') {
        result = await technicalApi.submitPoiProposal(result.id, result)
        setSaved(result)
        await queryClient.invalidateQueries({ queryKey: ['technical', 'poi-proposals'] })
      }
      const submitted = action === 'submit'
      if (created) celebrate({ title: `Đã tạo POI “${body.name}”`, detail: submitted ? 'Đã gửi kiểm chứng. POI dùng được cho tuyến khi kỹ thuật xác nhận PASS.' : 'Đã lưu bản nháp. Gửi kiểm chứng để kỹ thuật xác nhận PASS trước khi dùng cho tuyến.' })
      else notify(submitted
        ? { title: `Đã gửi kiểm chứng POI “${body.name}”`, detail: 'Chờ kỹ thuật xác nhận. Gửi kiểm chứng chưa tạo kết quả PASS.' }
        : { title: `Đã lưu revision POI “${body.name}”`, detail: 'Bản nháp; chưa gửi kiểm chứng.' })
      if (!poiId) navigate(`/staff/manage/pois/${result.id}`, { replace: true })
    } catch (cause) {
      setError(errorText(cause))
      if (isMapEligibilityConflict(cause)) {
        await maps.refetch()
        if (current && mapMissingFromList) await mapDetailsQuery.refetch()
      }
    }
    finally { setBusy(false) }
  }

  const historyRows = history.data?.revisions ?? []
  if ((proposalQuery.isPending && poiId) || maps.isPending || (mapMissingFromList && mapDetailsQuery.isPending)) return <AdminPage><p className="p-8 text-sm text-[#64748b]">Đang tải…</p></AdminPage>
  if (proposalQuery.isError || maps.error || (mapMissingFromList && mapDetailsQuery.isError)) return <AdminPage><p role="alert" className="p-4 text-sm text-red-700">Không tải được điểm tham quan hoặc bản đồ. Hãy thử tải lại trang.</p></AdminPage>

  const back = <Link to="/staff/manage/pois" className="mb-3 inline-flex items-center gap-1 text-sm text-[#2d719e]"><ArrowLeft size={14} />Danh sách điểm tham quan</Link>
  if (!poiId && eligibleMaps.length === 0) return <AdminPage>
    {back}
    <PageHeader eyebrow="Chuẩn bị Tour · POI" title="Tạo điểm tham quan" description="Điểm tham quan được đặt trên một bản đồ đã kiểm tra đạt." />
    <section className={`${panelClass} px-6 py-10 text-center`} role="status">
      <MapPinOff size={28} className="mx-auto text-[#b7791f]" aria-hidden="true" />
      <h2 className="mt-3 text-[15px] font-semibold text-[#0f172a]">Chưa có bản đồ được kỹ thuật xác nhận đạt</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-[#64748b]">Điểm tham quan phải được đặt trên một bản đồ đã kiểm tra đạt. Hãy liên hệ kỹ thuật viên trước khi tạo POI.</p>
      {(maps.data?.length ?? 0) > 0 && <ul className="mx-auto mt-4 max-w-md divide-y divide-[#eef1f4] rounded-xl border border-[#e2e8f0] text-left text-sm">
        {maps.data!.map(item => <li key={item.map.id} className="flex items-center justify-between gap-3 px-3 py-2"><span className="text-[#334155]">{item.map.areaName} · v{item.map.versionNumber}</span><span className="text-xs font-semibold text-[#7d5310]">{mapCheckLabel(item.technicalCheckStatus)}</span></li>)}
      </ul>}
    </section>
  </AdminPage>

  const state = current ? poiStatus(current.revision) : null
  const locked = !mapEligible || historicalReadOnly
  const yawDeg = draft.yaw == null ? null : Math.round((draft.yaw * 180 / Math.PI) * 10) / 10
  return <AdminPage>
    {back}
    <PageHeader eyebrow="Chuẩn bị Tour · POI" title={poiId ? (current?.revision.name ?? 'Điểm tham quan') : 'Tạo điểm tham quan'} description="Chọn bản đồ, bấm lên bản đồ để đặt vị trí và hướng, rồi gửi kỹ thuật viên kiểm chứng." />
    {current && state && <div className="mb-4"><Notice tone={state.tone === 'danger' ? 'danger' : state.tone === 'ok' ? 'success' : 'info'}>Phiên bản {current.currentRevision} · {state.label}{current.revision.verificationSourceRevisionId ? ' · kết quả lấy từ một phiên bản trước' : ''}</Notice></div>}
    {current && selectedItem && !selectedItem.canUseForPoiPreparation && <div className="mb-4"><Notice tone="warn">Bản đồ của điểm này hiện không đủ điều kiện để chỉnh sửa: {selectedItem.preparationBlockReason} Lịch sử và kết quả kiểm chứng vẫn được giữ; bản đồ và vị trí bên dưới chỉ để xem.</Notice></div>}
    <form className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" onSubmit={event => { event.preventDefault(); void mutate('save') }}>
      <div className="min-w-0 space-y-3">
        <section className={`${panelClass} space-y-2 p-4`}>
          <label className="block text-sm font-medium" htmlFor="poi-map">Bản đồ</label>
          <select title="" id="poi-map" className={inputClass} required value={draft.mapVersionId} onChange={event => { update({ mapVersionId: event.target.value, x: null, y: null, yaw: null }); setPoseMode('position') }}><option value="">— Chọn bản đồ —</option>{maps.data?.map(item => { const { map } = item; return <option key={map.id} value={map.id} disabled={!item.canUseForPoiPreparation}>{map.areaName} · v{map.versionNumber}{item.canUseForPoiPreparation ? '' : ` · ${mapCheckLabel(item.technicalCheckStatus)}`}</option> })}{selectedItem && !maps.data?.some(item => item.map.id === selectedItem.map.id) && <option value={selectedItem.map.id} disabled={!selectedItem.canUseForPoiPreparation}>{selectedItem.map.areaName} · v{selectedItem.map.versionNumber} · {mapCheckLabel(selectedItem.technicalCheckStatus)}</option>}</select>
          {selectedItem && <p className="flex flex-wrap items-center gap-2 text-xs text-[#64748b]"><span className="font-mono">{selectedItem.map.mapKey}</span>{selectedItem.currentlyDeployedOn.length > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">Robot đang triển khai: {selectedItem.currentlyDeployedOn.map(robot => robot.robotCode).join(', ')}</span>}</p>}
          {selectedItem?.technicalCheckStatus === 'PASSED' && selectedItem.currentlyDeployedOn.length === 0 && <div role="status"><Notice tone="warn">Chưa có robot nào đang chạy phiên bản này. POI có thể không kiểm chứng được cho đến khi kỹ thuật triển khai lại.</Notice></div>}
        </section>
        {mapError && <p role="alert" className="text-sm text-red-700">{mapError}</p>}
        {pickerMap && selectedItem ? <PoiPosePicker map={pickerMap} pose={pose} editable={mapEligible} mode={mapEligible ? poseMode : 'pan'} onModeChange={setPoseMode} onPoseChange={value => update(value)} /> : <div className={`${panelClass} grid min-h-[320px] place-items-center p-5 text-center text-sm text-[#64748b]`}><div><MapPinned size={26} className="mx-auto mb-2 text-[#94a3b8]" aria-hidden="true" />{mapDetailsQuery.isError ? 'Không tải được phiên bản bản đồ lịch sử.' : draft.mapVersionId ? 'Đang tải bản đồ…' : 'Chọn bản đồ ở trên để đặt vị trí điểm.'}</div></div>}
        <details className={`${panelClass} px-4 py-3 text-sm`}>
          <summary className="cursor-pointer font-medium text-[#334155]">Nhập toạ độ thủ công <span className="font-normal text-[#64748b]">{draft.x != null && draft.y != null ? `· ${draft.x.toFixed(2)}, ${draft.y.toFixed(2)}${yawDeg != null ? ` · ${yawDeg}°` : ''}` : '· chưa đặt vị trí'}</span></summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3"><PoseNumberField label="X (m)" value={draft.x} disabled={locked} change={x => update({ x })} /><PoseNumberField label="Y (m)" value={draft.y} disabled={locked} change={y => update({ y })} /><PoseNumberField label="Hướng (độ)" value={yawDeg} disabled={locked} change={deg => update({ yaw: deg == null ? null : deg * Math.PI / 180 })} /></div>
        </details>
      </div>
      <aside className={`${panelClass} space-y-3 p-4 lg:sticky lg:top-4`}>
        <label className="block text-sm">Tên POI<input className={`${inputClass} mt-1`} required maxLength={150} value={draft.name} onChange={e => update({ name: e.target.value })} placeholder="Sảnh thư viện" /></label>
        <label className="block text-sm">Mục đích<input className={`${inputClass} mt-1`} required maxLength={500} value={draft.purpose} onChange={e => update({ purpose: e.target.value })} placeholder="Giới thiệu khu tự học" /></label>
        <label className="block text-sm">Mô tả<textarea className={`${inputClass} mt-1`} rows={3} maxLength={1000} value={draft.description} onChange={e => update({ description: e.target.value })} /></label>
        <label className="block text-sm">Nội dung thuyết minh<textarea className={`${inputClass} mt-1`} rows={4} required maxLength={4000} value={draft.narrationText} onChange={e => update({ narrationText: e.target.value })} /></label>
        <label className="block text-sm">Video dự phòng (HTTPS, không bắt buộc)<input className={`${inputClass} mt-1`} type="url" maxLength={2048} pattern="https://.*" value={draft.fallbackVideoUrl} onChange={e => update({ fallbackVideoUrl: e.target.value })} /></label>
        <label className="block text-sm">Góc camera<select className={`${inputClass} mt-1`} value={draft.cameraPreset} onChange={e => update({ cameraPreset: e.target.value })}>{Object.entries(cameraPresetLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="flex flex-col gap-2 border-t border-[#eef1f4] pt-3">
          <button type="button" disabled={busy || locked} onClick={() => void mutate('submit')} className={buttonClass('primary')}>{busy ? 'Đang xử lý…' : 'Gửi kiểm chứng'}</button>
          <button type="submit" disabled={busy || locked} className={buttonClass('secondary')}>{busy ? 'Đang lưu…' : 'Lưu nháp'}</button>
          <p className="text-xs text-[#64748b]">Mỗi lần lưu tạo một phiên bản mới. Kỹ thuật viên sẽ cho robot chạy thử tới điểm và ghi kết quả.</p>
        </div>
      </aside>
    </form>
    {current && <section className={`${panelClass} mt-5 p-4`}><h2 className="font-semibold">Lịch sử phiên bản</h2>{historyRows.length ? <ol className="mt-2 space-y-2">{historyRows.map(item => <li key={item.id} className="text-sm">Phiên bản {item.revisionNumber} · {poiStatus(item).label}</li>)}</ol> : <p className="mt-2 text-sm text-[#64748b]">{history.isPending ? 'Đang tải lịch sử…' : 'Chưa có lịch sử.'}</p>}{history.data?.verificationRecords.length ? <div className="mt-3 border-t pt-3"><h3 className="text-sm font-medium">Kết quả kiểm chứng</h3><ul className="mt-2 space-y-2">{history.data.verificationRecords.map(record => <li key={record.id} className="text-sm">Phiên bản {record.revisionNumber} · {record.resultCode === 'PASS' ? 'Đạt' : 'Không đạt'} · {record.robotCode} · {new Date(record.checkedAt).toLocaleString('vi-VN')}{record.reason && <p className="text-red-700">Lý do: {record.reason}</p>}<p className="text-xs text-[#64748b]">{record.evidenceNote}</p></li>)}</ul></div> : null}</section>}
  </AdminPage>
}

function isMapEligibilityConflict(error: unknown) {
  if (!error || typeof error !== 'object' || !('body' in error) || typeof error.body !== 'string') return false
  try {
    const code = (JSON.parse(error.body) as { errors?: { code?: unknown } }).errors?.code
    return code === 'TECHNICAL_CHECK_PENDING' || code === 'TECHNICAL_CHECK_NOT_PASSED'
  } catch { return false }
}

function PoseNumberField({ label, value, disabled, change }: { label: string; value: number | null; disabled: boolean; change: (value: number | null) => void }) {
  return <label className="text-sm">{label}<input type="number" disabled={disabled} className={`${inputClass} mt-1`} step="any" value={value ?? ''} onChange={event => change(event.target.value === '' ? null : globalThis.Number(event.target.value))} /></label>
}

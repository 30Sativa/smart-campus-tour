import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, ChevronRight, CircleAlert, Info, MapPinned, MapPinOff } from 'lucide-react'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { AdminPage, Notice } from '../../../features/administration/AdminUi'
import { celebrate, notify } from '../../../components/ui/toast-store'
import { technicalApi, type PoiProposal } from '../../../features/technical/api/technical'
import { errorText } from '../../../features/technical/technical-format'
import { useMapVersions } from '../../../features/technical/technical-hooks'
import { NARRATION_NEEDED, cameraPresetLabel, mapCheckLabel, mapVersionLabel, poiStatus, verificationMethodLabel } from '../../../features/technical/poi-labels'
import { PoiPosePicker, type PickerMode, type PickerPose } from '../../../features/administration/pois/map/PoiPosePicker'
import { clearanceMessage, poseClearance } from '../../../features/administration/pois/map/occupancy-grid'
import { useMapRaster } from '../../../features/administration/pois/map/use-map-raster'

const card = 'ct-panel min-w-0 rounded-[15px] bg-white shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)]'
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2'

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
  const { map: pickerMap, error: mapError, retry: retryMap } = useMapRaster(draft.mapVersionId)
  const mapEligible = Boolean(selectedItem?.canUseForPoiPreparation)
  const historicalReadOnly = Boolean(current && selectedItem && !mapEligible)
  const pose: PickerPose = { x: draft.x, y: draft.y, yaw: draft.yaw }

  const history = useQuery({ queryKey: ['technical', 'poi-history', poiId], queryFn: () => technicalApi.getPoiHistory(poiId!), enabled: Boolean(poiId) })
  const update = (values: Partial<Draft>) => { setDraftOverride(value => ({ ...draft, ...value, ...values })); setError(null) }
  const mutate = async (action: 'save' | 'submit') => {
    if (!mapEligible || historicalReadOnly || !draft.mapVersionId || !draft.name.trim() || !draft.purpose.trim() || !draft.narrationText.trim() || draft.x == null || draft.y == null || draft.yaw == null) {
      setError('Cần chọn bản đồ, nhập tên, mục đích, nội dung thuyết minh và đặt vị trí cùng hướng trên bản đồ.')
      return
    }
    // The server skips this for a pose kept from the current revision, so a content edit stays possible.
    const poseKept = current?.revision.mapVersionId === draft.mapVersionId && current.revision.x === draft.x && current.revision.y === draft.y
    const clearanceMeters = selectedItem?.poiClearanceMeters
    if (!poseKept && pickerMap && clearanceMeters != null && poseClearance(pickerMap, pickerMap.pixels ?? null, { x: draft.x, y: draft.y }, clearanceMeters) === 'blocked') {
      setError(clearanceMessage(clearanceMeters))
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

  const back = <Link to="/staff/manage/pois" className="mb-2 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-[#475569] hover:text-[#2d3748] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]"><ArrowLeft size={15} aria-hidden="true" />Danh sách POI</Link>
  if (!poiId && eligibleMaps.length === 0) return <AdminPage>
    {back}
    <PageHeader eyebrow="Chuẩn bị Tour · POI" title="Tạo điểm tham quan" description="Điểm tham quan được đặt trên một bản đồ đã kiểm tra đạt." />
    <section className={`${panelClass} px-6 py-10 text-center`} role="status">
      <MapPinOff size={28} className="mx-auto text-[#b7791f]" aria-hidden="true" />
      <h2 className="mt-3 text-[15px] font-semibold text-[#0f172a]">Chưa có bản đồ được kỹ thuật xác nhận đạt</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-[#64748b]">Điểm tham quan phải được đặt trên một bản đồ đã kiểm tra đạt. Hãy liên hệ kỹ thuật viên trước khi tạo POI.</p>
      {(maps.data?.length ?? 0) > 0 && <ul className="mx-auto mt-4 max-w-md divide-y divide-[#eef1f4] rounded-xl border border-[#e2e8f0] text-left text-sm">
        {maps.data!.map(item => <li key={item.map.id} className="flex items-center justify-between gap-3 px-3 py-2"><span className="text-[#334155]">{mapVersionLabel(item.map)}</span><span className="text-xs font-semibold text-[#7d5310]">{mapCheckLabel(item.technicalCheckStatus)}</span></li>)}
      </ul>}
    </section>
  </AdminPage>

  const state = current ? poiStatus(current.revision) : null
  const locked = !mapEligible || historicalReadOnly
  const yawDeg = draft.yaw == null ? null : Math.round((draft.yaw * 180 / Math.PI) * 10) / 10
  const placed = draft.x != null && draft.y != null
  const contentReady = Boolean(draft.name.trim() && draft.purpose.trim() && draft.narrationText.trim())
  const steps: Array<[boolean, string, string]> = [
    [Boolean(selectedItem), 'Bản đồ đã chọn', 'Chưa chọn bản đồ'],
    [placed, 'Vị trí đã đặt', 'Vị trí chưa đặt'],
    [draft.yaw != null, 'Hướng đã chọn', 'Hướng chưa chọn'],
    [contentReady, 'Nội dung đủ', 'Nội dung chưa đủ'],
  ]
  const missing = [!draft.mapVersionId && 'bản đồ', !placed && 'vị trí', draft.yaw == null && 'hướng robot', !draft.name.trim() && 'tên POI', !draft.purpose.trim() && 'mục đích', !draft.narrationText.trim() && 'thuyết minh'].filter(Boolean) as string[]
  const field = `${inputClass} mt-1.5`
  const label = 'flex items-center gap-1 text-sm font-medium text-[#2d3748]'
  const required = <span aria-hidden="true" className="text-[#c53030]">*</span>
  return <AdminPage>
    {back}
    <header className="mb-5">
      <h1 className="text-2xl leading-tight font-bold text-[#2d3748]">{poiId ? (current?.revision.name ?? 'Điểm tham quan') : 'Tạo điểm tham quan'}</h1>
      <p className="mt-1 text-sm text-[#718096]">Đặt vị trí và hướng robot, sau đó hoàn thiện nội dung.</p>
    </header>
    {current && state && <div className="mb-4"><Notice tone={state.tone === 'danger' ? 'danger' : state.tone === 'ok' ? 'success' : 'info'}>Phiên bản {current.currentRevision} · {state.label}{current.revision.verificationSourceRevisionId ? ' · kết quả lấy từ một phiên bản trước' : ''}</Notice></div>}
    {current?.revision.verificationMethod && <div className="mb-4"><Notice tone="info">Cách kiểm chứng: {verificationMethodLabel[current.revision.verificationMethod]}.</Notice></div>}
    {current?.sourcePoiId && !current.revision.narrationText && <div className="mb-4"><Notice tone="warn">{NARRATION_NEEDED}. POI này được nhập từ tệp ghi pose trên robot, chỉ cần thêm tên và thuyết minh; vị trí giữ nguyên thì không phải kiểm chứng lại.</Notice></div>}
    {current && selectedItem && !selectedItem.canUseForPoiPreparation && <div className="mb-4"><Notice tone="warn">Bản đồ của điểm này hiện không đủ điều kiện để chỉnh sửa: {selectedItem.preparationBlockReason} Lịch sử và kết quả kiểm chứng vẫn được giữ; bản đồ và vị trí bên dưới chỉ để xem.</Notice></div>}

    <section className={`${card} mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5`} aria-label="Bản đồ và tiến độ">
      <span className="text-sm text-[#718096]">Bản đồ / Phiên bản</span>
      <select title="" id="poi-map" aria-label="Bản đồ" className={`min-h-10 min-w-56 rounded-xl border border-[#e2e8f0] bg-white px-3 text-sm font-semibold text-[#2d3748] ${focus}`} required value={draft.mapVersionId} onChange={event => { update({ mapVersionId: event.target.value, x: null, y: null, yaw: null }); setPoseMode('position') }}><option value="">— Chọn bản đồ —</option>{maps.data?.map(item => { const { map } = item; return <option key={map.id} value={map.id} disabled={!item.canUseForPoiPreparation}>{map.areaName} · v{map.versionNumber}{item.canUseForPoiPreparation ? '' : ` · ${mapCheckLabel(item.technicalCheckStatus)}`}</option> })}{selectedItem && !maps.data?.some(item => item.map.id === selectedItem.map.id) && <option value={selectedItem.map.id} disabled={!selectedItem.canUseForPoiPreparation}>{selectedItem.map.areaName} · v{selectedItem.map.versionNumber} · {mapCheckLabel(selectedItem.technicalCheckStatus)}</option>}</select>
      {selectedItem && <span className="rounded-lg bg-[#f1f5f9] px-2.5 py-1 font-mono text-xs text-[#475569]">{selectedItem.map.mapKey}</span>}
      {selectedItem && selectedItem.currentlyDeployedOn.length > 0 && <span className="rounded-lg bg-[#edf3fc] px-2.5 py-1 text-xs font-medium text-[#3f62a0]">Robot đang triển khai: {selectedItem.currentlyDeployedOn.map(robot => robot.robotCode).join(', ')}</span>}
      <ol aria-label="Tiến độ" className="flex flex-wrap items-center gap-x-3 gap-y-2 xl:ml-auto xl:border-l xl:border-[#e2e8f0] xl:pl-4">
        {steps.map(([ok, done, todo], index) => (
          <li key={done} className="flex items-center gap-2 text-[13px]">
            {index > 0 && <span aria-hidden="true" className="h-px w-3 bg-[#cbd5e1]" />}
            <span aria-hidden="true" className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${ok ? 'bg-[#edf3fb] text-[#4a6fa5]' : 'bg-[#f1f5f9] text-[#94a3b8]'}`}>{ok ? <Check size={12} strokeWidth={3} /> : index + 1}</span>
            <span className={ok ? 'font-semibold text-[#2d3748]' : 'text-[#718096]'}>{ok ? done : todo}</span>
          </li>
        ))}
      </ol>
    </section>
    {selectedItem?.technicalCheckStatus === 'PASSED' && selectedItem.currentlyDeployedOn.length === 0 && <div role="status" className="mb-4"><Notice tone="warn">Chưa có robot nào đang chạy phiên bản này. POI có thể không kiểm chứng được cho đến khi kỹ thuật triển khai lại.</Notice></div>}

    <form id="poi-form" className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]" onSubmit={event => { event.preventDefault(); void mutate('save') }}>
      <section className={`${card} min-w-0 p-5`} aria-label="Vị trí và hướng robot">
        <h2 className="mb-3 text-lg font-bold text-[#2d3748]">Vị trí & hướng robot</h2>
        {mapError && <div role="alert" className="mb-3"><Notice tone="danger" action={<button type="button" onClick={retryMap} className={buttonClass('secondary', 'sm')}>Thử lại</button>}>{mapError}</Notice></div>}
        {pickerMap && selectedItem ? <PoiPosePicker map={pickerMap} pose={pose} editable={mapEligible} mode={mapEligible ? poseMode : 'pan'} onModeChange={setPoseMode} onPoseChange={value => update(value)} clearanceMeters={selectedItem.poiClearanceMeters} /> : <div className="grid min-h-[380px] place-items-center rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-5 text-center text-sm text-[#718096]"><div><MapPinned size={26} className="mx-auto mb-2 text-[#a0aec0]" aria-hidden="true" />{mapDetailsQuery.isError ? 'Không tải được phiên bản bản đồ lịch sử.' : mapError ? 'Chưa tải được bản đồ.' : draft.mapVersionId ? 'Đang tải bản đồ…' : 'Chọn bản đồ ở trên để đặt vị trí điểm.'}</div></div>}
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {([['X (m)', draft.x == null ? null : draft.x.toFixed(2), 'Chưa đặt'], ['Y (m)', draft.y == null ? null : draft.y.toFixed(2), 'Chưa đặt'], ['Hướng thân robot (rad)', draft.yaw == null ? null : draft.yaw.toFixed(3), 'Chưa chọn']] as const).map(([name, value, none]) => (
            <div key={name} className="rounded-xl border border-[#e2e8f0] px-3.5 py-2.5">
              <dt className="text-xs text-[#718096]">{name}</dt>
              <dd className={`mt-1 rounded-lg bg-[#f8fafc] px-3 py-1.5 font-mono text-sm ${value == null ? 'text-[#a0aec0]' : 'font-semibold text-[#2d3748]'}`}>{value ?? none}</dd>
            </div>
          ))}
        </dl>
        <details className="group mt-3 rounded-xl border border-[#e2e8f0] text-sm">
          <summary className={`flex cursor-pointer list-none items-center gap-2 rounded-xl px-3.5 py-2.5 font-medium text-[#2d3748] [&::-webkit-details-marker]:hidden ${focus}`}><ChevronRight size={15} aria-hidden="true" className="text-[#718096] transition-transform group-open:rotate-90" />Nhập tọa độ thủ công <span className="font-normal text-[#718096]">(không bắt buộc){placed && yawDeg != null ? ` · ${yawDeg}°` : ''}</span></summary>
          <div className="grid gap-3 border-t border-[#e2e8f0] p-3.5 sm:grid-cols-3"><PoseNumberField label="X (m)" value={draft.x} disabled={locked} change={x => update({ x })} /><PoseNumberField label="Y (m)" value={draft.y} disabled={locked} change={y => update({ y })} /><PoseNumberField label="Hướng (độ)" value={yawDeg} disabled={locked} change={deg => update({ yaw: deg == null ? null : deg * Math.PI / 180 })} /></div>

    <form className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" onSubmit={event => { event.preventDefault(); void mutate('save') }}>
      <div className="min-w-0 space-y-3">
        <section className={`${panelClass} space-y-2 p-4`}>
          <label className="block text-sm font-medium" htmlFor="poi-map">Bản đồ</label>
          <select title="" id="poi-map" className={inputClass} required value={draft.mapVersionId} onChange={event => { update({ mapVersionId: event.target.value, x: null, y: null, yaw: null }); setPoseMode('position') }}><option value="">— Chọn bản đồ —</option>{maps.data?.map(item => { const { map } = item; return <option key={map.id} value={map.id} disabled={!item.canUseForPoiPreparation}>{mapVersionLabel(map)}{item.canUseForPoiPreparation ? '' : ` · ${mapCheckLabel(item.technicalCheckStatus)}`}</option> })}{selectedItem && !maps.data?.some(item => item.map.id === selectedItem.map.id) && <option value={selectedItem.map.id} disabled={!selectedItem.canUseForPoiPreparation}>{mapVersionLabel(selectedItem.map)} · {mapCheckLabel(selectedItem.technicalCheckStatus)}</option>}</select>
          {selectedItem && <p className="flex flex-wrap items-center gap-2 text-xs text-[#64748b]"><span className="font-mono">{selectedItem.map.mapKey}</span>{selectedItem.currentlyDeployedOn.length > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">Robot đang triển khai: {selectedItem.currentlyDeployedOn.map(robot => robot.robotCode).join(', ')}</span>}</p>}
          {selectedItem?.technicalCheckStatus === 'PASSED' && selectedItem.currentlyDeployedOn.length === 0 && <div role="status"><Notice tone="warn">Chưa có robot nào đang chạy phiên bản này. POI có thể không kiểm chứng được cho đến khi kỹ thuật triển khai lại.</Notice></div>}
        </section>
        {mapError && <div role="alert"><Notice tone="danger" action={<button type="button" onClick={retryMap} className={buttonClass('secondary', 'sm')}>Thử lại</button>}>{mapError}</Notice></div>}
        {pickerMap && selectedItem ? <PoiPosePicker map={pickerMap} pose={pose} editable={mapEligible} mode={mapEligible ? poseMode : 'pan'} onModeChange={setPoseMode} onPoseChange={value => update(value)} clearanceMeters={selectedItem.poiClearanceMeters} /> : <div className={`${panelClass} grid min-h-[320px] place-items-center p-5 text-center text-sm text-[#64748b]`}><div><MapPinned size={26} className="mx-auto mb-2 text-[#94a3b8]" aria-hidden="true" />{mapDetailsQuery.isError ? 'Không tải được phiên bản bản đồ lịch sử.' : mapError ? 'Chưa tải được bản đồ.' : draft.mapVersionId ? 'Đang tải bản đồ…' : 'Chọn bản đồ ở trên để đặt vị trí điểm.'}</div></div>}
        <details className={`${panelClass} px-4 py-3 text-sm`}>
          <summary className="cursor-pointer font-medium text-[#334155]">Nhập toạ độ thủ công <span className="font-normal text-[#64748b]">{draft.x != null && draft.y != null ? `· ${draft.x.toFixed(2)}, ${draft.y.toFixed(2)}${yawDeg != null ? ` · ${yawDeg}°` : ''}` : '· chưa đặt vị trí'}</span></summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3"><PoseNumberField label="X (m)" value={draft.x} disabled={locked} change={x => update({ x })} /><PoseNumberField label="Y (m)" value={draft.y} disabled={locked} change={y => update({ y })} /><PoseNumberField label="Hướng (độ)" value={yawDeg} disabled={locked} change={deg => update({ yaw: deg == null ? null : deg * Math.PI / 180 })} /></div>
        </details>
      </section>

      <aside className={`${card} space-y-5 p-5 lg:sticky lg:top-4`} aria-label="Nội dung điểm">
        <div className="space-y-3.5">
          <h2 className="text-lg font-bold text-[#2d3748]">Thông tin điểm</h2>
          <div><span className={label}><label htmlFor="poi-name">Tên POI</label>{required}</span><input id="poi-name" className={field} required maxLength={150} value={draft.name} onChange={e => update({ name: e.target.value })} placeholder="Sảnh thư viện" /></div>
          <div><span className={label}><label htmlFor="poi-purpose">Mục đích</label>{required}</span><input id="poi-purpose" className={field} required maxLength={500} value={draft.purpose} onChange={e => update({ purpose: e.target.value })} placeholder="Giới thiệu khu tự học" /></div>
          <div><span className={label}><label htmlFor="poi-description">Mô tả</label><span className="font-normal text-[#718096]">(không bắt buộc)</span></span><textarea id="poi-description" className={field} rows={3} maxLength={1000} value={draft.description} onChange={e => update({ description: e.target.value })} placeholder="Thông tin bổ sung về điểm tham quan…" /></div>
        </div>
        <div className="space-y-2 border-t border-[#e2e8f0] pt-5">
          <h2 className="text-lg font-bold text-[#2d3748]">Nội dung thuyết minh</h2>
          <div><span className={label}><label htmlFor="poi-narration">Thuyết minh</label>{required}</span><textarea id="poi-narration" aria-label="Nội dung thuyết minh" className={field} rows={4} required maxLength={4000} value={draft.narrationText} onChange={e => update({ narrationText: e.target.value })} placeholder="Nhập nội dung giới thiệu tại điểm này…" /></div>
          <p className="text-xs text-[#718096]">Robot đọc nội dung này khi dừng tại điểm.</p>
        </div>
        <div className="space-y-2 border-t border-[#e2e8f0] pt-5">
          <h2 className="text-lg font-bold text-[#2d3748]">Camera & tư liệu</h2>
          <div><label htmlFor="poi-camera" className={label}>Góc camera tại POI</label><select id="poi-camera" aria-label="Góc camera" className={field} value={draft.cameraPreset} onChange={e => update({ cameraPreset: e.target.value })}>{!(draft.cameraPreset in cameraPresetLabel) && <option value={draft.cameraPreset} disabled>Hướng cũ {draft.cameraPreset}, cần chọn lại</option>}{Object.entries(cameraPresetLabel).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></div>
          <p className="text-xs text-[#718096]">Khác với hướng thân robot được đặt trên bản đồ.</p>
          <details className="group rounded-xl border border-[#e2e8f0] text-sm" open={Boolean(draft.fallbackVideoUrl)}>
            <summary className={`flex cursor-pointer list-none items-center gap-2 rounded-xl px-3.5 py-2.5 font-medium text-[#2d3748] [&::-webkit-details-marker]:hidden ${focus}`}><ChevronRight size={15} aria-hidden="true" className="text-[#718096] transition-transform group-open:rotate-90" />Video dự phòng HTTPS <span className="font-normal text-[#718096]">(không bắt buộc)</span></summary>
            <div className="border-t border-[#e2e8f0] p-3.5"><label className="block text-sm text-[#2d3748]">Đường dẫn video<input className={field} type="url" maxLength={2048} pattern="https://.*" value={draft.fallbackVideoUrl} onChange={e => update({ fallbackVideoUrl: e.target.value })} placeholder="https://…" /></label></div>
          </details>
        </div>
        <p className="flex items-start gap-2 text-xs text-[#718096]"><Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />Gửi đề xuất để kỹ thuật viên kiểm chứng. Mỗi lần lưu tạo một phiên bản mới.</p>
      </aside>
    </form>

    {current && <section className={`${card} mt-4 p-5`} aria-label="Lịch sử phiên bản"><h2 className="text-lg font-bold text-[#2d3748]">Lịch sử phiên bản</h2>{historyRows.length ? <ol className="mt-2 space-y-1.5">{historyRows.map(item => <li key={item.id} className="text-sm text-[#2d3748]">Phiên bản {item.revisionNumber} · {poiStatus(item).label}</li>)}</ol> : <p className="mt-2 text-sm text-[#718096]">{history.isPending ? 'Đang tải lịch sử…' : 'Chưa có lịch sử.'}</p>}{history.data?.verificationRecords.length ? <div className="mt-3 border-t border-[#e2e8f0] pt-3"><h3 className="text-sm font-semibold text-[#2d3748]">Kết quả kiểm chứng</h3><ul className="mt-2 space-y-2">{history.data.verificationRecords.map(record => <li key={record.id} className="text-sm text-[#2d3748]">Phiên bản {record.revisionNumber} · {record.resultCode === 'PASS' ? 'Đạt' : 'Không đạt'} · {record.robotCode} · {new Date(record.checkedAt).toLocaleString('vi-VN')}{record.reason && <p className="text-[#a4473d]">Lý do: {record.reason}</p>}<p className="text-xs text-[#718096]">{record.evidenceNote}</p></li>)}</ul></div> : null}</section>}

    {/* The page's actions stay in reach at the bottom of the screen. */}
    <div className="sticky bottom-3 z-20 mt-4 rounded-[15px] border border-[#e2e8f0] bg-white/90 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.25)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <div className="min-w-0 flex-1">
          {error ? <p role="alert" className="flex items-start gap-2 text-sm text-[#a4473d]"><CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />{error}</p>
            : locked && current ? <p className="text-sm text-[#718096]">Điểm này đang ở chế độ chỉ xem.</p>
            : missing.length ? <p className="flex items-start gap-2.5 text-sm"><CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[#c08a1e]" /><span><b className="block font-semibold text-[#2d3748]">Chưa đủ thông tin</b><span className="text-[#718096]">Còn thiếu: {missing.join(', ')}.</span></span></p>
            : <p className="flex items-center gap-2 text-sm font-semibold text-[#2d3748]"><Check size={16} aria-hidden="true" className="text-[#3f62a0]" />Đủ thông tin để gửi kiểm chứng.</p>}
        </div>
        <p className="hidden text-xs text-[#a0aec0] xl:block">Lưu tạo phiên bản mới; gửi kiểm chứng chưa phải kết quả đạt.</p>
        <Link to="/staff/manage/pois" className={buttonClass('secondary')}>Hủy bỏ</Link>
        <button type="submit" form="poi-form" disabled={busy || locked} className={buttonClass('secondary')}>{busy ? 'Đang lưu…' : 'Lưu nháp'}</button>
        <button type="button" disabled={busy || locked} onClick={() => void mutate('submit')} className={buttonClass('primary')}>{busy ? 'Đang xử lý…' : 'Gửi kiểm chứng'}</button>
      </div>
    </div>
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

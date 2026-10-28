import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { AdminPage, Notice } from '../../../features/administration/AdminUi'
import { technicalApi, type PoiProposal } from '../../../features/technical/api/technical'
import { errorText } from '../../../features/technical/technical-format'
import { useMapVersions } from '../../../features/technical/technical-hooks'
import { PoiPosePicker, type PickerMode, type PickerPose } from '../../../features/administration/pois/map/PoiPosePicker'
import { parseVersionedMapPackage, rasterPngBlob } from '../../../features/administration/pois/map/versioned-package'
import type { OccupancyMap } from '../../../features/administration/pois/map/catalog'

type Draft = { mapVersionId: string; name: string; purpose: string; description: string; x: number | null; y: number | null; yaw: number | null; cameraPreset: string }
const empty: Draft = { mapVersionId: '', name: '', purpose: '', description: '', x: null, y: null, yaw: null, cameraPreset: 'FRONT' }

function asDraft(item: PoiProposal): Draft {
  const { revision } = item
  return { mapVersionId: revision.mapVersionId, name: revision.name, purpose: revision.purpose, description: revision.description ?? '', x: revision.x, y: revision.y, yaw: revision.yaw, cameraPreset: revision.cameraPreset }
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
    if (!mapEligible || historicalReadOnly || !draft.mapVersionId || !draft.name.trim() || !draft.purpose.trim() || draft.x == null || draft.y == null || draft.yaw == null) {
      setError('Chọn map, nhập tên/mục đích và đặt đủ vị trí/hướng trên bản đồ.')
      return
    }
    const body = { ...draft, x: draft.x!, y: draft.y!, yaw: draft.yaw!, name: draft.name.trim(), purpose: draft.purpose.trim(), description: draft.description.trim() || null }
    setBusy(true); setError(null)
    try {
      let result = current
      if (result) result = await technicalApi.revisePoiProposal(result.id, result, body)
      else result = await technicalApi.createPoiProposal(body)
      setSaved(result)
      await queryClient.invalidateQueries({ queryKey: ['technical', 'poi-proposals'] })
      if (action === 'submit') {
        result = await technicalApi.submitPoiProposal(result.id, result)
        setSaved(result)
        await queryClient.invalidateQueries({ queryKey: ['technical', 'poi-proposals'] })
      }
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
  if ((proposalQuery.isPending && poiId) || maps.isPending || (mapMissingFromList && mapDetailsQuery.isPending)) return <AdminPage><p className="p-8">Đang tải…</p></AdminPage>
  if (proposalQuery.isError || maps.error || (mapMissingFromList && mapDetailsQuery.isError)) return <AdminPage><p role="alert" className="p-4 text-sm text-red-700">Không tải được dữ liệu POI hoặc map. Hãy thử tải lại.</p></AdminPage>

  return <AdminPage>
    <Link to="/staff/manage/pois" className="mb-3 inline-flex items-center gap-1 text-sm text-[#2d719e]"><ArrowLeft size={14} />Danh sách đề xuất</Link>
    <PageHeader eyebrow="Tour Staff · POI versioned" title={poiId ? `Đề xuất ${current?.revision.name ?? ''}` : 'Tạo đề xuất POI'} description="Mỗi nội dung được lưu thành revision gắn với đúng map version. Chỉ Technical Staff mới ghi kết quả kiểm chứng." />
    <div className="mb-4"><Notice tone="warn">Chỉ map đã có kiểm tra kỹ thuật đạt mới dùng để tạo hoặc gửi POI. Tạo revision hoặc submit không tự tạo PASS. Project YAML POI import chưa được hỗ trợ.</Notice></div>
    {current && <div className="mb-4"><Notice tone={current.revision.navigationStatus === 'FAIL' ? 'danger' : current.revision.navigationStatus === 'PASS' ? 'success' : 'info'}>Revision {current.currentRevision} · {current.revision.navigationStatus}{current.revision.isSubmitted ? ' · đã gửi kiểm chứng' : ' · bản nháp'}{current.revision.verificationSourceRevisionId ? ` · kết quả dựa trên revision ${current.revision.verificationSourceRevisionId}` : ''}</Notice></div>}
    {current && selectedItem && !selectedItem.canUseForPoiPreparation && <div className="mb-4"><Notice tone="warn">Map của đề xuất hiện không đủ điều kiện cho thao tác mới: {selectedItem.preparationBlockReason} Lịch sử revision và kết quả kiểm chứng vẫn được giữ; bản đồ và pose bên dưới chỉ đọc.</Notice></div>}
    {eligibleMaps.length === 0 && <div className="mb-4" role="status"><Notice tone="warn">Chưa có bản đồ được kỹ thuật xác nhận đạt. Vui lòng liên hệ Technical Staff trước khi tạo POI.</Notice></div>}
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void mutate('save') }}>
      <section className={`${panelClass} space-y-3 p-4`}>
        <label className="block text-sm font-medium">Bản đồ<select className={`${inputClass} mt-1`} required value={draft.mapVersionId} onChange={event => { update({ mapVersionId: event.target.value, x: null, y: null, yaw: null }); setPoseMode('position') }}><option value="">— Chọn map —</option>{maps.data?.map(item => { const { map } = item; const label = item.technicalCheckStatus === 'PASSED' ? 'Đã có kiểm tra kỹ thuật đạt' : item.technicalCheckStatus === 'FAILED' ? 'Kiểm tra chưa đạt' : 'Chờ kỹ thuật kiểm tra'; return <option key={map.id} value={map.id} disabled={!item.canUseForPoiPreparation}>{map.mapKey} · v{map.versionNumber} · {label}</option> })}{selectedItem && !maps.data?.some(item => item.map.id === selectedItem.map.id) && <option value={selectedItem.map.id} disabled={!selectedItem.canUseForPoiPreparation}>{selectedItem.map.mapKey} · v{selectedItem.map.versionNumber} · {selectedItem.technicalCheckStatus === 'FAILED' ? 'Kiểm tra chưa đạt' : 'Chờ kỹ thuật kiểm tra'}</option>}</select></label>
        {selectedItem && <p className="text-xs text-[#64748b]">{selectedItem.map.areaName} · {selectedItem.map.imageWidth}×{selectedItem.map.imageHeight} · {selectedItem.map.resolution} m/ô · {selectedItem.map.frameId}</p>}
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Tên POI<input className={`${inputClass} mt-1`} required maxLength={150} value={draft.name} onChange={e => update({ name: e.target.value })} /></label><label className="text-sm">Mục đích<input className={`${inputClass} mt-1`} required maxLength={500} value={draft.purpose} onChange={e => update({ purpose: e.target.value })} /></label></div>
        <label className="block text-sm">Mô tả<textarea className={`${inputClass} mt-1`} rows={2} maxLength={1000} value={draft.description} onChange={e => update({ description: e.target.value })} /></label>
        <label className="block text-sm">Camera preset<select className={`${inputClass} mt-1`} value={draft.cameraPreset} onChange={e => update({ cameraPreset: e.target.value })}><option value="FRONT">FRONT</option><option value="LEFT">LEFT</option><option value="RIGHT">RIGHT</option></select></label>
      </section>
      {mapError && <p role="alert" className="text-sm text-red-700">{mapError}</p>}
      {pickerMap && selectedItem ? <PoiPosePicker map={pickerMap} pose={pose} editable={mapEligible} mode={mapEligible ? poseMode : 'pan'} onModeChange={setPoseMode} onPoseChange={value => update(value)} /> : <div className={`${panelClass} p-5 text-sm text-[#64748b]`}>{mapDetailsQuery.isError ? 'Không tải được phiên bản map lịch sử.' : draft.mapVersionId ? 'Đang tải package map để xem…' : 'Chọn map đã có kiểm tra kỹ thuật đạt để xem và chọn vị trí.'}</div>}
      <div className="grid gap-3 sm:grid-cols-3"><PoseNumberField label="X (m)" value={draft.x} disabled={!mapEligible || historicalReadOnly} change={x => update({ x })} /><PoseNumberField label="Y (m)" value={draft.y} disabled={!mapEligible || historicalReadOnly} change={y => update({ y })} /><PoseNumberField label="Yaw (rad)" value={draft.yaw} disabled={!mapEligible || historicalReadOnly} change={yaw => update({ yaw })} /></div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="submit" disabled={busy || !mapEligible || historicalReadOnly} className={buttonClass('secondary')}>{busy ? 'Đang lưu…' : 'Lưu revision nháp'}</button><button type="button" disabled={busy || !mapEligible || historicalReadOnly} onClick={() => void mutate('submit')} className={buttonClass('primary')}>{busy ? 'Đang xử lý…' : 'Lưu và gửi kiểm chứng'}</button></div>
    </form>
    {current && <section className={`${panelClass} mt-5 p-4`}><h2 className="font-semibold">Lịch sử revision</h2>{historyRows.length ? <ol className="mt-2 space-y-2">{historyRows.map(item => <li key={item.id} className="text-sm">r{item.revisionNumber} · {item.mapKey} · {item.navigationStatus}{item.isSubmitted ? ' · đã gửi' : ' · nháp'}</li>)}</ol> : <p className="mt-2 text-sm text-[#64748b]">{history.isPending ? 'Đang tải lịch sử…' : 'Chưa có lịch sử.'}</p>}{history.data?.verificationRecords.length ? <div className="mt-3 border-t pt-3"><h3 className="text-sm font-medium">Kết quả kiểm chứng</h3><ul className="mt-2 space-y-2">{history.data.verificationRecords.map(record => <li key={record.id} className="text-sm">r{record.revisionNumber} · {record.resultCode} · {new Date(record.checkedAt).toLocaleString()}{record.reason && <p className="text-red-700">Lý do: {record.reason}</p>}<p className="text-xs text-[#64748b]">{record.evidenceNote}</p></li>)}</ul></div> : null}</section>}
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

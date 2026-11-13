import { useState } from 'react'
import type { DragEvent } from 'react'
import { FileUp, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { RobotPicker } from '../../features/technical/RobotPicker'
import { Note, TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { mapCheckLabel, mapVersionLabel, poiImportActionLabel, verificationMethodLabel } from '../../features/technical/poi-labels'
import { errorText } from '../../features/technical/technical-format'
import { useImportPoiFiles, useMapVersions, usePhysicalRobots, usePoiProposals, usePreviewPoiImport } from '../../features/technical/technical-hooks'
import type { MapVersionItem, PoiImportResult, PoiProposal } from '../../features/technical/api/technical'

const mapCheckTone = (status: string) => status === 'PASSED' ? 'ok' : status === 'FAILED' ? 'danger' : 'warn'
const verifiedLabel = (verified: boolean | null) => verified === null ? '-' : verified ? verificationMethodLabel.POSE_CAPTURE : 'Chờ kiểm chứng'

/**
 * Imports the pose files recorded on the robot. Every rule lives on the server:
 * this page shows its per-file verdict and sends nothing until that verdict is clean.
 */
export default function TechnicalPoiFileImportPage() {
  const maps = useMapVersions()
  const robots = usePhysicalRobots()
  const preview = usePreviewPoiImport()
  const importFiles = useImportPoiFiles()
  const [mapVersionId, setMapVersionId] = useState('')
  const [robotCode, setRobotCode] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [evidenceNote, setEvidenceNote] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [imported, setImported] = useState<PoiImportResult | null>(null)
  const selectedMap = maps.data?.find(item => item.map.id === mapVersionId)

  // Any change makes this a different import, so it must not reuse a retry key or an old verdict.
  const changed = () => {
    setRequestId(crypto.randomUUID())
    setImported(null)
    preview.reset()
    importFiles.reset()
  }
  const pickFiles = (picked: FileList | null) => {
    setFiles(Array.from(picked ?? []))
    changed()
  }
  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    pickFiles(event.dataTransfer.files)
  }
  const runPreview = () => preview.mutate({ mapVersionId, robotCode, files })
  const runImport = () => importFiles.mutate({ requestId, mapVersionId, robotCode, evidenceNote: evidenceNote.trim(), files }, {
    onSuccess: result => { setImported(result); setRequestId(crypto.randomUUID()); setFiles([]); setEvidenceNote(''); preview.reset() },
    // A rule can change after the preview: refresh the table so the failing file is named.
    onError: runPreview,
  })

  const ready = Boolean(mapVersionId && robotCode && files.length)
  const canImport = ready && preview.data?.canImport === true && evidenceNote.trim().length > 0 && !importFiles.isPending

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Bản đồ & POI" title="Nhập POI từ file" description="Nhập tệp pose đã ghi trên robot. Đây là bằng chứng ghi pose, không thay cho chạy thử toàn tuyến. Staff bổ sung tên và thuyết minh sau." />

      <section className={`${panelClass} space-y-4 p-4`} aria-label="Chọn tệp nhập">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="import-map">Phiên bản bản đồ</label>
            <select title="" id="import-map" className={`${inputClass} mt-1`} required value={mapVersionId} disabled={maps.isPending || maps.isError} onChange={event => { setMapVersionId(event.target.value); changed() }}>
              <option value="">Chọn phiên bản</option>
              {maps.data?.map(item => <option key={item.map.id} value={item.map.id}>{mapVersionLabel(item.map)}</option>)}
            </select>
            {maps.isError && <p role="alert" className="mt-1 text-sm text-[#b23e18]">{errorText(maps.error)}</p>}
            {selectedMap && <p className="mt-1.5"><ToneBadge tone={mapCheckTone(selectedMap.technicalCheckStatus)}>{mapCheckLabel(selectedMap.technicalCheckStatus)}</ToneBadge></p>}
          </div>
          <div>
            <RobotPicker id="import-robot" label="Robot đã ghi pose" mapKey={selectedMap?.map.mapKey} value={robotCode} onChange={value => { setRobotCode(value); changed() }} robots={robots} emptyText="Chưa có robot vật lý được đăng ký." />
          </div>
        </div>

        <label htmlFor="import-files" onDragOver={event => event.preventDefault()} onDrop={drop}
          className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-6 text-center text-sm text-[#475569]">
          <FileUp size={20} className="text-[#2d719e]" aria-hidden="true" />
          <span className="font-semibold">{files.length ? `Đã chọn ${files.length} tệp` : 'Kéo thả tệp vào đây hoặc bấm để chọn'}</span>
          <span className="text-xs text-[#64748b]">.yaml, .yml tối đa 50 tệp, mỗi tệp 64 KB, hoặc một tệp ZIP chứa chúng ở thư mục gốc</span>
          <input id="import-files" type="file" multiple accept=".yaml,.yml,.zip" className="sr-only" onChange={event => pickFiles(event.target.files)} />
        </label>

        <div className="flex justify-end">
          <button type="button" className={buttonClass('secondary')} disabled={!ready || preview.isPending} onClick={runPreview}>{preview.isPending ? 'Đang kiểm tra…' : 'Xem trước'}</button>
        </div>
        {preview.isError && <p role="alert" className="text-sm text-[#b23e18]">{errorText(preview.error)}</p>}
      </section>

      {preview.isPending && <p className="mt-3 flex items-center justify-center gap-2 py-6 text-[13px] font-semibold text-[#64748b]" aria-busy="true"><LoaderCircle size={16} className="animate-spin text-[#2d719e]" aria-hidden="true" />Đang kiểm tra tệp…</p>}

      {preview.data && (
        <section className={`${panelClass} mt-3`} aria-label="Xem trước nhập POI">
          <PanelHead title="Xem trước" description={preview.data.canImport ? 'Tất cả tệp hợp lệ.' : 'Có tệp lỗi nên chưa thể nhập. Lần nhập chỉ thành công khi mọi tệp đều hợp lệ.'} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>Tệp</th><th className={thClass}>Mã POI</th><th className={thClass}>Tên</th><th className={thClass}>x / y / yaw</th><th className={thClass}>Kiểm chứng</th><th className={thClass}>Kết quả</th></tr></thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {preview.data.files.map(file => <tr key={`${file.fileName}:${file.fileSha256}`} className={rowClass}>
                  <td className={`${tdClass} break-all`}>{file.fileName}</td>
                  <td className={`${tdClass} font-mono text-xs`}>{file.poiId ?? '-'}</td>
                  <td className={tdClass}>{file.name ?? '-'}</td>
                  <td className={`${tdClass} font-mono text-xs`}>{file.x === null ? '-' : `${file.x} / ${file.y} / ${file.yaw}`}</td>
                  <td className={tdClass}>{verifiedLabel(file.verified)}</td>
                  <td className={tdClass}>{file.errorCode
                    ? <><ToneBadge tone="danger">Lỗi</ToneBadge><p className="mt-0.5 text-[11.5px] text-[#b23e18]">{file.errorMessage}</p></>
                    : <ToneBadge tone={file.action === 'NO_CHANGE' ? 'muted' : 'ok'}>{poiImportActionLabel[file.action ?? ''] ?? '-'}</ToneBadge>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 border-t border-[#eef1f4] p-4">
            <div>
              <label className={labelClass} htmlFor="import-evidence">Ghi chú bằng chứng</label>
              <textarea id="import-evidence" rows={3} className={`${inputClass} mt-1`} required maxLength={1700} value={evidenceNote} onChange={event => { setEvidenceNote(event.target.value); importFiles.reset() }} />
            </div>
            <Note>Tệp ghi verified: true được lưu là "{verificationMethodLabel.POSE_CAPTURE}", không ghi nhận robot đã tự chạy tới điểm. Tệp verified: false vào hàng chờ kiểm chứng.</Note>
            {importFiles.isError && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errorText(importFiles.error)}</p>}
            <div className="flex justify-end"><button type="button" className={buttonClass('primary')} disabled={!canImport} onClick={runImport}>{importFiles.isPending ? 'Đang nhập…' : 'Nhập'}</button></div>
          </div>
        </section>
      )}

      {imported && <ImportResult result={imported} />}

      <ImportedPoiList maps={maps.data ?? []} />
    </TechnicalPage>
  )
}

/** What one import did, file by file, and where each POI goes next for Technical and for Staff. */
function ImportResult({ result }: { result: PoiImportResult }) {
  const waiting = result.files.filter(file => !file.verified).length
  return (
    <section className={`${panelClass} mt-3`} aria-label="Kết quả nhập POI">
      <PanelHead title="Đã nhập" description={`Tạo mới ${result.createdProposalIds.length} POI, thêm phiên bản cho ${result.updatedProposalIds.length} POI.`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left">
          <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>Mã POI</th><th className={thClass}>Tệp</th><th className={thClass}>Thay đổi</th><th className={thClass}>Kiểm chứng</th></tr></thead>
          <tbody className="divide-y divide-[#eef1f4]">
            {result.files.map(file => <tr key={`${file.fileName}:${file.proposalRevisionId}`} className={rowClass}>
              <td className={`${tdClass} font-mono text-xs`}>{file.poiId}</td>
              <td className={`${tdClass} break-all`}>{file.fileName}</td>
              <td className={tdClass}>{poiImportActionLabel[file.action] ?? file.action}</td>
              <td className={tdClass}>{file.verified ? <ToneBadge tone="ok">Đạt · {verificationMethodLabel.POSE_CAPTURE}</ToneBadge> : <ToneBadge tone="warn">Chờ kiểm chứng</ToneBadge>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 border-t border-[#eef1f4] p-4 text-sm text-[#334155]">
        {waiting > 0 && <p>{waiting} POI chờ kiểm chứng nằm ở trang Kiểm chứng POI, cần cho robot chạy tới điểm rồi ghi kết quả.</p>}
        <p>Tour Staff thấy các POI này ở Quản lý POI, trên đúng phiên bản bản đồ đã chọn, để đặt tên và viết thuyết minh. Chưa có thuyết minh thì POI chưa đưa vào tuyến được.</p>
        {waiting > 0 && <Link className={buttonClass('secondary', 'sm')} to="/technical/poi-import">Mở hàng chờ kiểm chứng</Link>}
      </div>
    </section>
  )
}

const importedStatus = (proposal: PoiProposal): { tone: 'ok' | 'warn' | 'danger'; label: string } =>
  proposal.revision.navigationStatus === 'PASS' ? { tone: 'ok', label: proposal.revision.verificationMethod ? `Đạt · ${verificationMethodLabel[proposal.revision.verificationMethod] ?? ''}` : 'Đạt' }
    : proposal.revision.navigationStatus === 'FAIL' ? { tone: 'danger', label: 'Không đạt' }
    : { tone: 'warn', label: 'Chờ kiểm chứng' }

/** Every POI that came from a robot pose file, so Technical can see what each import left behind. */
function ImportedPoiList({ maps }: { maps: MapVersionItem[] }) {
  const proposals = usePoiProposals()
  const imported = (proposals.data ?? []).filter(proposal => proposal.sourcePoiId)
  const mapName = (id: string, fallback: string) => {
    const found = maps.find(item => item.map.id === id)?.map
    return found ? mapVersionLabel(found) : fallback
  }
  return (
    <section className={`${panelClass} mt-3`} aria-label="POI đã nhập từ file">
      <PanelHead title="POI đã nhập từ file" description="Mỗi mã POI là một điểm trong khu vực bản đồ. Nhập lại cùng mã sẽ thêm phiên bản mới cho điểm đó." />
      {proposals.isPending ? <p role="status" className="px-4 py-6 text-center text-[13px] text-[#64748b]">Đang tải…</p>
        : proposals.isError ? <div role="alert" className="space-y-2 p-4 text-[13px] text-[#b23e31]"><p>{errorText(proposals.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void proposals.refetch()}>Tải lại</button></div>
        : !imported.length ? <p className="px-4 py-6 text-center text-[13px] text-[#64748b]">Chưa có POI nào được nhập từ file.</p>
        : <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>Mã POI</th><th className={thClass}>Tên</th><th className={thClass}>Bản đồ</th><th className={thClass}>Kiểm chứng</th><th className={thClass}>Thuyết minh</th></tr></thead>
            <tbody className="divide-y divide-[#eef1f4]">
              {imported.map(proposal => {
                const status = importedStatus(proposal)
                return <tr key={proposal.id} className={rowClass}>
                  <td className={`${tdClass} font-mono text-xs`}>{proposal.sourcePoiId}</td>
                  <td className={tdClass}>{proposal.revision.name}<span className="block text-[11.5px] text-[#64748b]">Phiên bản POI {proposal.currentRevision}</span></td>
                  <td className={tdClass}>{mapName(proposal.revision.mapVersionId, proposal.revision.mapKey)}</td>
                  <td className={tdClass}><ToneBadge tone={status.tone}>{status.label}</ToneBadge></td>
                  <td className={tdClass}>{proposal.revision.narrationText ? 'Staff đã bổ sung' : <span className="text-amber-800">Chờ Staff bổ sung</span>}</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>}
    </section>
  )
}

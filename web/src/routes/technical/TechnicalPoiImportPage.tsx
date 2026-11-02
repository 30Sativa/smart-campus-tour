import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CircleCheck, Clock3, LoaderCircle, RotateCcw } from 'lucide-react'
import { PageHeader, PanelHead, StatStrip, StatTile, panelClass } from '../../components/ui/ConsolePrimitives'
import { Modal } from '../../components/ui/Drawer'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { RobotPicker } from '../../features/technical/RobotPicker'
import { CheckRow, DetailFact, Note, TechnicalPage, ToneBadge, ViewDetailButton } from '../../features/technical/TechnicalUi'
import { cameraPresetLabel, mapVersionLabel, verificationMethodLabel } from '../../features/technical/poi-labels'
import { errorText, poiVerifyErrors, stamp } from '../../features/technical/technical-format'
import { useMapVersions, usePhysicalRobots, usePoiHistory, usePoiProposals, usePoiVerificationQueue, useVerifyPoi } from '../../features/technical/technical-hooks'
import type { PoiProposal, PoiRevision, PoiVerificationQueueItem } from '../../features/technical/api/technical'

type PoiFilter = 'pending' | 'retry' | 'passed'
/** `recordable` follows the backend queue: it holds exactly the revisions still accepting a result. */
type PoiRow = PoiVerificationQueueItem & { filter: PoiFilter; recordable: boolean }

const filterText: Record<PoiFilter, { title: string; empty: string }> = {
  pending: { title: 'POI chờ kiểm chứng', empty: 'Không có POI đang chờ kiểm chứng.' },
  retry: { title: 'POI cần kiểm tra lại', empty: 'Không có POI cần kiểm tra lại.' },
  passed: { title: 'POI đã đạt', empty: 'Chưa có POI đạt kiểm chứng.' },
}

function toRows(queue: PoiVerificationQueueItem[], proposals: PoiProposal[]): PoiRow[] {
  const queued = new Set(queue.map(item => item.proposalId))
  const recorded = proposals.filter(item => !queued.has(item.id) && ['PASS', 'FAIL'].includes(item.revision.navigationStatus))
  return [
    ...queue.map(item => ({ ...item, filter: (item.revision.navigationStatus === 'FAIL' ? 'retry' : 'pending') as PoiFilter, recordable: true })),
    ...recorded.map(({ id, currentRevision, rowVersion, revision }) => ({ proposalId: id, currentRevision, rowVersion, revision, filter: (revision.navigationStatus === 'PASS' ? 'passed' : 'retry') as PoiFilter, recordable: false })),
  ]
}

/**
 * POI verification: one table filtered by the figure strip; recording a check
 * opens a dialog bound to the exact revision and row version it was opened on,
 * and a recorded result opens read-only.
 */
export default function TechnicalPoiImportPage() {
  const proposals = usePoiVerificationQueue()
  const allProposals = usePoiProposals()
  // Holds the row itself: saving moves it between lists, and the dialog must not unmount mid-save.
  const [selected, setSelected] = useState<PoiRow | null>(null)
  const [viewing, setViewing] = useState<PoiRow | null>(null)
  const maps = useMapVersions()
  // People read the area and version; the map key is only a fallback while the list loads.
  const mapName = (mapKey: string) => {
    const map = maps.data?.find(item => item.map.mapKey === mapKey)?.map
    return map ? mapVersionLabel(map) : mapKey
  }
  const [filter, setFilter] = useState<PoiFilter>('pending')

  const rows = useMemo(() => toRows(proposals.data ?? [], allProposals.data ?? []), [proposals.data, allProposals.data])
  const visible = rows.filter(row => row.filter === filter)
  const count = (value: PoiFilter) => rows.filter(row => row.filter === value).length
  // The queue alone is enough for the first two figures; only recorded results need the full list.
  const recordedCount = (value: PoiFilter) => allProposals.isPending ? '…' : allProposals.isError ? '-' : count(value)

  return (
    <TechnicalPage>
      <PageHeader eyebrow="POI" title="Kiểm chứng POI" description="Ghi kết quả kiểm tra tại chỗ cho POI Staff đã gửi, gắn với đúng revision và version map. Đây là bằng chứng người kiểm tra nhập, không phải dữ liệu robot tự gửi." />

      {!proposals.isPending && !proposals.error && (
        <div className="mb-3">
          <StatStrip label="Lọc POI theo trạng thái kiểm chứng" columns="sm:grid-cols-3">
            <StatTile icon={Clock3} label="Chờ kiểm chứng" value={count('pending')} tone="warn" onClick={() => setFilter('pending')} pressed={filter === 'pending'} />
            <StatTile icon={RotateCcw} label="Cần kiểm tra lại" value={recordedCount('retry')} tone="danger" onClick={() => setFilter('retry')} pressed={filter === 'retry'} />
            <StatTile icon={CircleCheck} label="Đã đạt" value={recordedCount('passed')} onClick={() => setFilter('passed')} pressed={filter === 'passed'} />
          </StatStrip>
        </div>
      )}

      <section className={panelClass} aria-label="Danh sách kiểm chứng POI">
        <PanelHead title={filterText[filter].title} description="Nạp trực tiếp từ backend. POI nhập từ tệp có verified: false cũng nằm trong hàng chờ này." />
        {filter !== 'pending' && allProposals.isError && <div role="alert" className="space-y-2 border-b border-[#eef1f4] p-4 text-[13px] text-[#b23e31]"><p>{errorText(allProposals.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void allProposals.refetch()}>Tải lại danh sách POI</button></div>}
        {proposals.isPending ? <p className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] font-semibold text-[#64748b]" aria-busy="true"><LoaderCircle size={16} className="animate-spin text-[#2d719e]" aria-hidden="true" />Đang tải…</p> : proposals.error ? <p role="alert" className="p-4 text-[13px] text-[#b23e31]">{errorText(proposals.error)}</p> : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>POI</th><th className={thClass}>Bản đồ</th><th className={thClass}>Trạng thái</th><th className={thClass}>Đã gửi</th><th className={`${thClass} text-center`}>Thao tác</th></tr></thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {visible.map((item) => <tr key={`${item.proposalId}:${item.revision.revisionNumber}`} className={rowClass}>
                  <td className={tdClass}><span className="font-semibold text-[#0f172a]">{item.revision.name}</span><p className="text-[11.5px] text-[#64748b]">{item.revision.purpose}</p></td>
                  <td className={tdClass}>{mapName(item.revision.mapKey)}</td>
                  <td className={tdClass}><PoiStatus row={item} /></td>
                  <td className={`${tdClass} text-xs text-[#64748b]`}>{stamp(item.revision.submittedAt)}</td>
                  <td className={tdClass}><div className="flex items-center justify-center gap-2"><button className={buttonClass(item.recordable ? 'primary' : 'secondary', 'sm')} type="button" onClick={() => setSelected(item)}>{item.recordable ? 'Ghi kết quả' : 'Xem kết quả'}</button><ViewDetailButton label={`Xem chi tiết ${item.revision.name}`} onClick={() => setViewing(item)} /></div></td>
                </tr>)}
                {!visible.length && <tr><td className={`${tdClass} py-8 text-center text-[#64748b]`} colSpan={5}>{filterText[filter].empty}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {viewing && <PoiDetailModal row={viewing} mapName={mapName(viewing.revision.mapKey)} onClose={() => setViewing(null)} onRecord={() => { setViewing(null); setSelected(viewing) }} />}
      {selected?.recordable && <VerifyModal key={selected.proposalId} proposal={selected} onClose={() => setSelected(null)} />}
      {selected && !selected.recordable && <PoiResultModal key={selected.proposalId} proposalId={selected.proposalId} revision={selected.revision} onClose={() => setSelected(null)} />}
    </TechnicalPage>
  )
}

function PoiStatus({ row }: { row: PoiRow }) {
  if (row.filter === 'pending') return <ToneBadge tone="warn">Chờ kiểm chứng</ToneBadge>
  if (row.filter === 'passed') return <><ToneBadge tone="ok">Đã đạt</ToneBadge><MethodBadge method={row.revision.verificationMethod} /></>
  if (row.recordable) return <ToneBadge tone="danger">Cần kiểm tra lại</ToneBadge>
  return <><ToneBadge tone="danger">Không đạt</ToneBadge><p className="mt-0.5 text-[11.5px] text-[#64748b]">Chờ Staff sửa và gửi lại</p></>
}

function MethodBadge({ method }: { method?: string | null }) {
  return method ? <span className="ml-1"><ToneBadge tone="info">{verificationMethodLabel[method] ?? method}</ToneBadge></span> : null
}

/** What the table leaves out: where the robot must go and what it will say there. */
function PoiDetailModal({ row, mapName, onClose, onRecord }: { row: PoiRow; mapName: string; onClose: () => void; onRecord: () => void }) {
  const { revision } = row
  return (
    <Modal open title={revision.name} onClose={onClose}
      footer={<div className="flex justify-end"><button type="button" className={buttonClass('primary')} onClick={onRecord}>{row.recordable ? 'Ghi kết quả' : 'Xem kết quả'}</button></div>}>
      <dl className="divide-y divide-[#f1f5f9]">
        <DetailFact label="Trạng thái"><PoiStatus row={row} /></DetailFact>
        <DetailFact label="Mục đích">{revision.purpose}</DetailFact>
        {revision.description && <DetailFact label="Mô tả">{revision.description}</DetailFact>}
        <DetailFact label="Bản đồ">{mapName}</DetailFact>
        <DetailFact label="Phiên bản POI">{revision.revisionNumber}</DetailFact>
        <DetailFact label="Tọa độ"><span className="font-mono">x {revision.x}, y {revision.y}, yaw {revision.yaw}</span></DetailFact>
        <DetailFact label="Hướng camera">{cameraPresetLabel[revision.cameraPreset] ?? revision.cameraPreset}</DetailFact>
        <DetailFact label="Thuyết minh"><span className="whitespace-pre-wrap">{revision.narrationText ?? 'Chưa có nội dung thuyết minh'}</span></DetailFact>
        {revision.fallbackVideoUrl && <DetailFact label="Video dự phòng"><span className="break-all">{revision.fallbackVideoUrl}</span></DetailFact>}
      </dl>
    </Modal>
  )
}

function VerifyModal({ proposal, onClose }: { proposal: PoiVerificationQueueItem; onClose: () => void }) {
  const verify = useVerifyPoi()
  const robots = usePhysicalRobots()
  const [robotCode, setRobotCode] = useState('')
  const [evidence, setEvidence] = useState('')
  const [reason, setReason] = useState('')
  const [resultCode, setResultCode] = useState<'PASS' | 'FAIL'>('PASS')
  const [reached, setReached] = useState(true)
  const [stopped, setStopped] = useState(true)
  const [localized, setLocalized] = useState(true)
  const [cameraConfirmed, setCameraConfirmed] = useState(true)
  const { revision } = proposal

  const checks = [
    { label: 'Robot tới đúng POI', checked: reached, set: setReached },
    { label: 'Robot dừng đúng vị trí', checked: stopped, set: setStopped },
    { label: 'Localization đạt', checked: localized, set: setLocalized },
    { label: 'Camera preset được xác nhận', checked: cameraConfirmed, set: setCameraConfirmed },
  ]
  const missing = checks.filter(check => !check.checked).map(check => check.label)
  const passBlocked = resultCode === 'PASS' && missing.length > 0
  const failBlocked = resultCode === 'FAIL' && missing.length === 0
  const selectedRobot = robots.data?.find(robot => robot.robotCode === robotCode)
  // Advisory only: the server decides from the robot's latest deployment check.
  const robotElsewhere = selectedRobot && (selectedRobot.latestDeployedMapKey !== revision.mapKey || selectedRobot.latestDeploymentPassed === false)
  const errors = verify.error ? poiVerifyErrors(verify.error) : {}
  const changed = () => { if (verify.error) verify.reset() }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (passBlocked || failBlocked) return
    verify.mutate({
      proposalId: proposal.proposalId,
      revisionNumber: revision.revisionNumber,
      expectedRowVersion: proposal.rowVersion,
      robotCode,
      resultCode,
      reached,
      stopped,
      localizationPassed: localized,
      cameraPresetConfirmed: cameraConfirmed,
      reason: resultCode === 'FAIL' ? reason : undefined,
      evidenceNote: evidence,
    }, { onSuccess: onClose })
  }

  return (
    <Modal open size="lg" title={`Kiểm tra ${revision.name}`} description={`${revision.mapKey}, revision ${revision.revisionNumber} · camera ${revision.cameraPreset}. Đạt khi cả bốn kiểm tra đều đạt.`} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={onClose}>Đóng</button><button type="submit" form="poi-verify-form" className={buttonClass('primary')} disabled={verify.isPending || !robotCode || !evidence.trim() || passBlocked || failBlocked || (resultCode === 'FAIL' && !reason.trim())}>{verify.isPending ? 'Đang lưu…' : 'Lưu kết quả'}</button></div>}>
      <form id="poi-verify-form" className="space-y-3.5" onSubmit={submit}>
        <div>
          <RobotPicker id="verify-robot" label="Robot vật lý" value={robotCode} onChange={value => { setRobotCode(value); changed() }} robots={robots} emptyText="Chưa có robot vật lý được đăng ký. Cần đăng ký robot trước khi ghi kết quả kiểm chứng." />
          {errors.robotCode && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{errors.robotCode}</p>}
          {robotElsewhere && !errors.robotCode && <p role="status" className="mt-1 text-xs text-amber-800">Lần kiểm tra triển khai gần nhất của robot này không phải kết quả đạt trên {revision.mapKey}. Máy chủ sẽ từ chối cho tới khi có kiểm tra đạt đúng map này.</p>}
        </div>
        <div><label className={labelClass} htmlFor="verify-result">Kết quả</label><select id="verify-result" className={`${inputClass} mt-1`} value={resultCode} onChange={(event) => { setResultCode(event.target.value as 'PASS' | 'FAIL'); changed() }}><option value="PASS">Đạt</option><option value="FAIL">Không đạt</option></select></div>
        <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3 text-sm"><p className="font-medium">Nội dung thuyết minh, chỉ đọc</p><p className="mt-1 whitespace-pre-wrap">{revision.narrationText ?? 'Chưa có nội dung thuyết minh'}</p>{revision.fallbackVideoUrl && <p className="mt-2 break-all text-xs text-[#64748b]">Video dự phòng: {revision.fallbackVideoUrl}</p>}</div>
        <div className="space-y-2">
          {checks.map(check => <CheckRow key={check.label} checked={check.checked} onChange={value => { check.set(value); changed() }}>{check.label}</CheckRow>)}
          {passBlocked && <p role="alert" className="text-xs text-[#b23e18]">Chưa thể ghi Đạt, còn thiếu: {missing.join(', ')}. Tick đủ cả bốn mục hoặc đổi Kết quả thành Không đạt.</p>}
          {failBlocked && <p role="alert" className="text-xs text-[#b23e18]">Không đạt cần ít nhất một mục chưa đạt. Bỏ tick mục không đạt hoặc đổi Kết quả thành Đạt.</p>}
        </div>
        {resultCode === 'FAIL' && <div><label className={labelClass} htmlFor="verify-reason">Lý do không đạt</label><input id="verify-reason" aria-invalid={Boolean(errors.reason)} className={`${inputClass} mt-1`} required maxLength={1000} value={reason} onChange={(event) => { setReason(event.target.value); changed() }} />{errors.reason && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{errors.reason}</p>}</div>}
        <div><label className={labelClass} htmlFor="verify-evidence">Ghi chú bằng chứng</label><textarea id="verify-evidence" rows={3} aria-invalid={Boolean(errors.evidenceNote)} className={`${inputClass} mt-1`} required maxLength={2000} value={evidence} onChange={(event) => { setEvidence(event.target.value); changed() }} />{errors.evidenceNote && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{errors.evidenceNote}</p>}</div>
        {errors.form && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errors.form}</p>}
        <Note>Bản ghi gắn với revision {revision.revisionNumber}. Nếu Staff sửa POI trong lúc bạn kiểm tra, máy chủ sẽ từ chối và bạn cần mở lại.</Note>
      </form>
    </Modal>
  )
}

function PoiResultModal({ proposalId, revision, onClose }: { proposalId: string; revision: PoiRevision; onClose: () => void }) {
  const history = usePoiHistory(proposalId)
  const records = [...(history.data?.verificationRecords ?? [])].sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
  const observations = (record: (typeof records)[number]) => [
    { label: 'Robot tới đúng POI', passed: record.reached },
    { label: 'Robot dừng đúng vị trí', passed: record.stopped },
    { label: 'Localization đạt', passed: record.localizationPassed },
    { label: 'Camera preset được xác nhận', passed: record.cameraPresetConfirmed },
  ]
  return (
    <Modal open size="lg" title={`Kết quả ${revision.name}`} description={`${revision.mapKey}, revision ${revision.revisionNumber} · camera ${revision.cameraPreset}.`} onClose={onClose}
      footer={<div className="flex justify-end"><button type="button" className={buttonClass('secondary')} onClick={onClose}>Đóng</button></div>}>
      <div className="space-y-3">
        {history.isPending && <p role="status" className="text-sm text-[#64748b]">Đang tải kết quả…</p>}
        {history.isError && <div role="alert" className="space-y-2 text-sm text-[#b23e31]"><p>{errorText(history.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void history.refetch()}>Tải lại kết quả</button></div>}
        {records.map(record => {
          const effective = record.proposalRevisionId === revision.verificationSourceRevisionId
          return (
            <section key={record.id} aria-label={`Kết quả revision ${record.revisionNumber}`} className="rounded-lg border border-[#e2e8f0] p-3 text-[13px] text-[#334155]">
              <div className="flex flex-wrap items-center gap-2"><ToneBadge tone={record.resultCode === 'PASS' ? 'ok' : 'danger'}>{record.resultCode === 'PASS' ? 'Đạt' : 'Không đạt'}</ToneBadge><span className="font-semibold text-[#0f172a]">Revision {record.revisionNumber}</span><ToneBadge tone="muted">{verificationMethodLabel[record.verificationMethod] ?? record.verificationMethod}</ToneBadge>{effective && <ToneBadge tone="info">Đang áp dụng</ToneBadge>}</div>
              <p className="mt-1.5 text-xs text-[#64748b]">Robot <span className="font-mono">{record.robotCode}</span> · {stamp(record.checkedAt)}</p>
              {record.verificationMethod === 'POSE_CAPTURE'
                ? <p className="mt-2 text-xs">Pose được ghi từ robot khi đang ở đúng điểm. Không có quan sát tới nơi, dừng, localization hay camera.{record.sourceFileSha256 && <span className="mt-0.5 block break-all font-mono text-[11px] text-[#64748b]">SHA-256 {record.sourceFileSha256}</span>}</p>
                : <ul className="mt-2 grid gap-x-3 gap-y-0.5 text-xs sm:grid-cols-2">{observations(record).map(item => <li key={item.label}>{item.passed ? 'Đạt' : 'Chưa đạt'}: {item.label}</li>)}</ul>}
              {record.reason && <p className="mt-2"><span className="font-medium">Lý do:</span> {record.reason}</p>}
              <p className="mt-2 whitespace-pre-wrap"><span className="font-medium">Bằng chứng:</span> {record.evidenceNote}</p>
            </section>
          )
        })}
        {revision.verificationSourceRevisionId && revision.verificationSourceRevisionId !== revision.id && <Note>Revision {revision.revisionNumber} chỉ đổi nội dung nên giữ kết quả của revision đã kiểm chứng.</Note>}
        <Note>Kết quả đã ghi không sửa hay thu hồi được. Muốn kiểm tra lại, Staff tạo revision mới đổi vị trí, hướng, camera hoặc map rồi gửi lại, POI sẽ quay về Chờ kiểm chứng.</Note>
      </div>
    </Modal>
  )
}

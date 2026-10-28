import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CircleCheck, Clock3, LoaderCircle, RotateCcw } from 'lucide-react'
import { PageHeader, PanelHead, StatStrip, StatTile, panelClass } from '../../components/ui/ConsolePrimitives'
import { Drawer } from '../../components/ui/Drawer'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { CheckRow, Note, TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { errorText, stamp } from '../../features/technical/technical-format'
import { usePoiProposals, useVerifyPoi } from '../../features/technical/technical-hooks'
import type { PoiProposal } from '../../features/technical/api/technical'

/**
 * POI verification: what is waiting, as one table; the check itself opens in a
 * drawer beside it, bound to the exact revision and row version it was opened on.
 */
export default function TechnicalPoiImportPage() {
  const proposals = usePoiProposals()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const all = useMemo(() => proposals.data ?? [], [proposals.data])
  const queue = useMemo(() => all.filter((item) => item.revision.isSubmitted && item.revision.navigationStatus !== 'PASS'), [all])
  const selected = queue.find((item) => item.id === selectedId)
  const failing = queue.filter((item) => item.revision.navigationStatus === 'FAIL').length
  const passed = all.filter((item) => item.revision.navigationStatus === 'PASS').length

  return (
    <TechnicalPage>
      <PageHeader eyebrow="POI" title="Kiểm chứng POI" description="Ghi kết quả kiểm tra tại chỗ cho POI Staff đã gửi, gắn với đúng revision và version map. Đây là bằng chứng người kiểm tra nhập, không phải dữ liệu robot tự gửi." />

      {!proposals.isPending && !proposals.error && (
        <div className="mb-3">
          <StatStrip label="Tổng hợp kiểm chứng POI" columns="sm:grid-cols-3">
            <StatTile icon={Clock3} label="Chờ kiểm chứng" value={queue.length - failing} tone="warn" />
            <StatTile icon={RotateCcw} label="Cần kiểm tra lại" value={failing} tone="danger" />
            <StatTile icon={CircleCheck} label="Đã đạt" value={passed} />
          </StatStrip>
        </div>
      )}

      <section className={panelClass} aria-label="Hàng đợi kiểm chứng POI">
        <PanelHead title="POI đã gửi kiểm chứng" description="Nạp trực tiếp từ backend. Import POI bằng project YAML vẫn pending vì template/frame mapping chưa được chốt." />
        {proposals.isPending ? <p className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] font-semibold text-[#64748b]" aria-busy="true"><LoaderCircle size={16} className="animate-spin text-[#2d719e]" aria-hidden="true" />Đang tải…</p> : proposals.error ? <p role="alert" className="p-4 text-[13px] text-[#b23e31]">{errorText(proposals.error)}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>POI</th><th className={thClass}>Map</th><th className={thClass}>Tọa độ</th><th className={thClass}>Trạng thái</th><th className={thClass}>Đã gửi</th><th className={thClass}><span className="sr-only">Thao tác</span></th></tr></thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {queue.map((item) => <tr key={item.id} className={rowClass}>
                  <td className={tdClass}><span className="font-semibold text-[#0f172a]">{item.revision.name}</span><p className="text-[11.5px] text-[#64748b]">{item.revision.purpose}</p></td>
                  <td className={`${tdClass} font-mono text-xs`}>{item.revision.mapKey} · r{item.revision.revisionNumber}</td>
                  <td className={`${tdClass} font-mono text-xs text-[#64748b]`}>{item.revision.x}, {item.revision.y}, {item.revision.yaw}</td>
                  <td className={tdClass}><ToneBadge tone={item.revision.navigationStatus === 'FAIL' ? 'danger' : 'warn'}>{item.revision.navigationStatus === 'FAIL' ? 'Cần kiểm tra lại' : 'Chờ kiểm chứng'}</ToneBadge></td>
                  <td className={`${tdClass} text-xs text-[#64748b]`}>{stamp(item.revision.submittedAt)}</td>
                  <td className={`${tdClass} text-right`}><button className={buttonClass('primary', 'sm')} type="button" onClick={() => setSelectedId(item.id)}>Ghi kết quả</button></td>
                </tr>)}
                {!queue.length && <tr><td className={`${tdClass} py-8 text-center text-[#64748b]`} colSpan={6}>Không có POI đang chờ kiểm chứng.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && <VerifyDrawer key={selected.id} proposal={selected} onClose={() => setSelectedId(null)} />}
    </TechnicalPage>
  )
}

function VerifyDrawer({ proposal, onClose }: { proposal: PoiProposal; onClose: () => void }) {
  const verify = useVerifyPoi()
  const [robotCode, setRobotCode] = useState('')
  const [evidence, setEvidence] = useState('')
  const [reason, setReason] = useState('')
  const [resultCode, setResultCode] = useState<'PASS' | 'FAIL'>('PASS')
  const [reached, setReached] = useState(true)
  const [stopped, setStopped] = useState(true)
  const [localized, setLocalized] = useState(true)
  const [cameraConfirmed, setCameraConfirmed] = useState(true)
  const { revision } = proposal

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    verify.mutate({
      proposalId: proposal.id,
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
    <Drawer open title={`Kiểm tra ${revision.name}`} description={`${revision.mapKey}, revision ${revision.revisionNumber} · camera ${revision.cameraPreset}. Đạt khi cả bốn kiểm tra đều đạt.`} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={onClose}>Đóng</button><button type="submit" form="poi-verify-form" className={buttonClass('primary')} disabled={verify.isPending}>{verify.isPending ? 'Đang lưu…' : 'Lưu kết quả'}</button></div>}>
      <form id="poi-verify-form" className="space-y-3.5" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelClass} htmlFor="verify-robot">Robot vật lý</label><input id="verify-robot" className={`${inputClass} mt-1`} required maxLength={100} value={robotCode} onChange={(event) => setRobotCode(event.target.value)} /></div>
          <div><label className={labelClass} htmlFor="verify-result">Kết quả</label><select id="verify-result" className={`${inputClass} mt-1`} value={resultCode} onChange={(event) => setResultCode(event.target.value as 'PASS' | 'FAIL')}><option value="PASS">Đạt</option><option value="FAIL">Không đạt</option></select></div>
        </div>
        <div className="space-y-2">
          <CheckRow checked={reached} onChange={setReached}>Robot tới đúng POI</CheckRow>
          <CheckRow checked={stopped} onChange={setStopped}>Robot dừng đúng vị trí</CheckRow>
          <CheckRow checked={localized} onChange={setLocalized}>Localization đạt</CheckRow>
          <CheckRow checked={cameraConfirmed} onChange={setCameraConfirmed}>Camera preset được xác nhận</CheckRow>
        </div>
        {resultCode === 'FAIL' && <div><label className={labelClass} htmlFor="verify-reason">Lý do không đạt</label><input id="verify-reason" className={`${inputClass} mt-1`} required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></div>}
        <div><label className={labelClass} htmlFor="verify-evidence">Ghi chú bằng chứng</label><textarea id="verify-evidence" rows={4} className={`${inputClass} mt-1`} required maxLength={2000} value={evidence} onChange={(event) => setEvidence(event.target.value)} /></div>
        {verify.error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errorText(verify.error)}</p>}
        <Note>Bản ghi gắn với revision {revision.revisionNumber}. Nếu Staff sửa POI trong lúc bạn kiểm tra, máy chủ sẽ từ chối và bạn cần mở lại.</Note>
      </form>
    </Drawer>
  )
}

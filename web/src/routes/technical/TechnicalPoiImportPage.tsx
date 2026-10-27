import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { PageHeader, PanelHead, LoadingPanel, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { errorText, stamp } from '../../features/technical/technical-format'
import { usePoiProposals, useVerifyPoi } from '../../features/technical/technical-hooks'

export default function TechnicalPoiImportPage() {
  const proposals = usePoiProposals()
  const verify = useVerifyPoi()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [robotCode, setRobotCode] = useState('')
  const [evidence, setEvidence] = useState('')
  const [reason, setReason] = useState('')
  const [resultCode, setResultCode] = useState<'PASS' | 'FAIL'>('PASS')
  const [reached, setReached] = useState(true)
  const [stopped, setStopped] = useState(true)
  const [localized, setLocalized] = useState(true)
  const [cameraConfirmed, setCameraConfirmed] = useState(true)

  const queue = useMemo(() => (proposals.data ?? []).filter(item => item.revision.isSubmitted && item.revision.navigationStatus !== 'PASS'), [proposals.data])
  const selected = queue.find(item => item.id === selectedId)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    verify.mutate({
      proposalId: selected.id,
      revisionNumber: selected.revision.revisionNumber,
      expectedRowVersion: selected.rowVersion,
      robotCode,
      resultCode,
      reached,
      stopped,
      localizationPassed: localized,
      cameraPresetConfirmed: cameraConfirmed,
      reason: resultCode === 'FAIL' ? reason : undefined,
      evidenceNote: evidence,
    }, { onSuccess: () => { setSelectedId(null); setEvidence(''); setReason(''); verify.reset() } })
  }

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Kỹ thuật" title="Kiểm chứng POI" description="Ghi kết quả kiểm tra cho POI đã được Staff gửi, gắn với đúng revision và map version. Bản ghi là bằng chứng nhập từ người dùng, không xác nhận robot đã tự gửi dữ liệu." />
      <section className={panelClass} aria-label="Hàng đợi kiểm chứng POI">
        <PanelHead title="POI đã gửi kiểm chứng" description="Nạp trực tiếp từ backend. Import POI bằng project YAML vẫn pending vì template/frame mapping chưa được chốt." />
        {proposals.isPending ? <LoadingPanel /> : proposals.error ? <p role="alert" className="p-5 text-sm text-red-700">{errorText(proposals.error)}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-[#f1f5f9]"><th className={thClass}>POI</th><th className={thClass}>Map</th><th className={thClass}>Tọa độ</th><th className={thClass}>Trạng thái</th><th className={thClass}>Đã gửi</th><th className={thClass}>Thao tác</th></tr></thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {queue.map(item => <tr key={item.id} className={rowClass}>
                  <td className={tdClass}><span className="font-semibold">{item.revision.name}</span><p className="text-xs text-[#64748b]">{item.revision.purpose}</p></td>
                  <td className={`${tdClass} font-mono`}>{item.revision.mapKey} · r{item.revision.revisionNumber}</td>
                  <td className={`${tdClass} font-mono text-xs`}>{item.revision.x}, {item.revision.y}, {item.revision.yaw}</td>
                  <td className={tdClass}><ToneBadge tone={item.revision.navigationStatus === 'FAIL' ? 'danger' : 'warn'}>{item.revision.navigationStatus === 'FAIL' ? 'Cần kiểm tra lại' : 'Chờ kiểm chứng'}</ToneBadge></td>
                  <td className={`${tdClass} text-xs text-[#64748b]`}>{stamp(item.revision.submittedAt)}</td>
                  <td className={tdClass}><button className={buttonClass('primary', 'sm')} type="button" onClick={() => { setSelectedId(item.id); setVerifyDefaults() }}>Ghi kết quả</button></td>
                </tr>)}
                {!queue.length && <tr><td className={tdClass} colSpan={6}>Không có POI đang chờ kiểm chứng.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && <section className={`${panelClass} mt-5`} aria-label="Ghi kết quả kiểm chứng">
        <PanelHead title={`Kiểm tra ${selected.revision.name}`} description={`${selected.revision.mapKey}, revision ${selected.revision.revisionNumber}. PASS yêu cầu đủ bốn kiểm tra đạt.`} />
        <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={submit}>
          <div><label className={labelClass} htmlFor="verify-robot">Robot vật lý</label><input id="verify-robot" className={`${inputClass} mt-1.5`} required maxLength={100} value={robotCode} onChange={event => setRobotCode(event.target.value)} /></div>
          <div><label className={labelClass} htmlFor="verify-result">Kết quả</label><select id="verify-result" className={`${inputClass} mt-1.5`} value={resultCode} onChange={event => setResultCode(event.target.value as 'PASS' | 'FAIL')}><option value="PASS">Đạt</option><option value="FAIL">Không đạt</option></select></div>
          <div className="space-y-2 md:col-span-2">
            {[['reached', 'Robot tới đúng POI', reached, setReached], ['stopped', 'Robot dừng đúng vị trí', stopped, setStopped], ['localized', 'Localization đạt', localized, setLocalized], ['camera', 'Camera preset được xác nhận', cameraConfirmed, setCameraConfirmed]].map(([id, text, checked, setChecked]) => <label key={String(id)} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked as boolean} onChange={event => (setChecked as (value: boolean) => void)(event.target.checked)} />{text as string}</label>)}
          </div>
          {resultCode === 'FAIL' && <div className="md:col-span-2"><label className={labelClass} htmlFor="verify-reason">Lý do không đạt</label><input id="verify-reason" className={`${inputClass} mt-1.5`} required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></div>}
          <div className="md:col-span-2"><label className={labelClass} htmlFor="verify-evidence">Ghi chú bằng chứng</label><textarea id="verify-evidence" className={`${inputClass} mt-1.5`} required maxLength={2000} value={evidence} onChange={event => setEvidence(event.target.value)} /></div>
          {verify.error && <p role="alert" className="md:col-span-2 text-sm text-red-700">{errorText(verify.error)}</p>}
          <div className="flex gap-2 md:col-span-2"><button type="submit" className={buttonClass('primary')} disabled={verify.isPending}>{verify.isPending ? 'Đang lưu…' : 'Lưu kết quả'}</button><button type="button" className={buttonClass('secondary')} onClick={() => setSelectedId(null)}>Đóng</button></div>
        </form>
      </section>}
    </TechnicalPage>
  )

  function setVerifyDefaults() {
    setRobotCode('')
    setEvidence('')
    setReason('')
    setResultCode('PASS')
    setReached(true)
    setStopped(true)
    setLocalized(true)
    setCameraConfirmed(true)
    verify.reset()
  }
}

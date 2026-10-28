import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Plus } from 'lucide-react'
import { LoadingPanel, PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass, labelClass } from '../../components/ui/ui-classes'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { TECHNICAL_ROBOTS, useRecordDeployment, useRecordLocalization, useReopenLocalization, useTechnicalData } from '../../features/technical/technical-hooks'
import { CONFIRMATION_STATE, errorText, mapState, routeLabel, stamp } from '../../features/technical/technical-format'
import { CheckRow, EvidenceStep, Facts, Notice, ResultChoice, TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { MapLegend, TechnicalMap } from '../../features/technical/TechnicalMap'
import type { MapVersionStatus } from '../../features/technical/types'

function DeployForm({ map }: { map: MapVersionStatus }) {
  const deploy = useRecordDeployment()
  const [robot, setRobot] = useState(TECHNICAL_ROBOTS[0])
  const [matched, setMatched] = useState(false)
  return (
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); deploy.mutate({ mapKey: map.mapKey, robot, checksumMatched: matched }) }}>
      <div>
        <label htmlFor="deploy-robot" className={labelClass}>Robot</label>
        <select id="deploy-robot" className={`${inputClass} mt-1.5`} value={robot} onChange={(event) => setRobot(event.target.value)}>{TECHNICAL_ROBOTS.map((item) => <option key={item}>{item}</option>)}</select>
      </div>
      <CheckRow checked={matched} onChange={setMatched}>Checksum trên robot khớp <span className="font-mono">{map.checksum}</span></CheckRow>
      {deploy.error && <p role="alert" className="text-[13px] font-semibold text-[#b23e31]">{errorText(deploy.error)}</p>}
      <button type="submit" className={buttonClass('primary', 'sm')} disabled={!matched || deploy.isPending}>{deploy.isPending ? 'Đang ghi…' : 'Ghi deploy'}</button>
    </form>
  )
}

type Point = { label: string; errorCm: string }

function LocalizationForm({ map }: { map: MapVersionStatus }) {
  const record = useRecordLocalization()
  const [passed, setPassed] = useState<boolean | null>(null)
  const [errorCm, setErrorCm] = useState('')
  const [points, setPoints] = useState<Point[]>([{ label: '', errorCm: '' }, { label: '', errorCm: '' }, { label: '', errorCm: '' }])
  const [twin, setTwin] = useState(false)
  const [note, setNote] = useState('')
  const mean = Number(errorCm)
  const ready = passed !== null && errorCm.trim() !== '' && Number.isFinite(mean) && mean >= 0 && !record.isPending
  const setPoint = (index: number, patch: Partial<Point>) => setPoints((list) => list.map((item, i) => i === index ? { ...item, ...patch } : item))

  const submit = () => {
    if (!ready || passed === null) return
    const measured = points.filter((p) => p.label.trim() && p.errorCm.trim() !== '' && Number.isFinite(Number(p.errorCm))).map((p) => ({ label: p.label.trim(), errorCm: Number(p.errorCm) }))
    const text = [twin ? 'Đã đối chiếu với 3D Twin.' : null, note.trim() || null].filter(Boolean).join(' ')
    record.mutate({ mapKey: map.mapKey, passed, errorCm: mean, points: measured, note: text })
  }

  return (
    <form className="space-y-3.5" onSubmit={(event) => { event.preventDefault(); submit() }}>
      <ResultChoice name="localization-result" value={passed} onChange={setPassed} />
      <div>
        <label htmlFor="loc-mean" className={labelClass}>Sai lệch trung bình (cm)</label>
        <input id="loc-mean" type="number" min={0} step={0.1} inputMode="decimal" className={`${inputClass} mt-1.5`} value={errorCm} onChange={(event) => setErrorCm(event.target.value)} />
      </div>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-[#334155]">Điểm đo</legend>
        <div className="space-y-2">
          {points.map((point, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
              <input aria-label={`Vị trí đo ${index + 1}`} placeholder="Vị trí, ví dụ Sảnh thang máy" className={inputClass} value={point.label} onChange={(event) => setPoint(index, { label: event.target.value })} />
              <input aria-label={`Sai lệch điểm ${index + 1} (cm)`} placeholder="cm" type="number" min={0} step={0.1} className={inputClass} value={point.errorCm} onChange={(event) => setPoint(index, { errorCm: event.target.value })} />
            </div>
          ))}
        </div>
        <button type="button" className={`${buttonClass('ghost', 'sm')} mt-1.5`} onClick={() => setPoints((list) => [...list, { label: '', errorCm: '' }])}><Plus size={14} aria-hidden="true" />Thêm điểm đo</button>
      </fieldset>
      <CheckRow checked={twin} onChange={setTwin}>Đã đối chiếu vị trí robot với 3D Twin</CheckRow>
      <div>
        <label htmlFor="loc-note" className={labelClass}>Ghi chú</label>
        <textarea id="loc-note" rows={2} className={`${inputClass} mt-1.5 resize-y`} value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      {record.error && <p role="alert" className="text-[13px] font-semibold text-[#b23e31]">{errorText(record.error)}</p>}
      <button type="submit" className={buttonClass('primary', 'sm')} disabled={!ready}>{record.isPending ? 'Đang lưu…' : 'Lưu kết quả localization'}</button>
    </form>
  )
}

/** One map version and the evidence recorded for it, step by step. */
export default function TechnicalMapDetailPage() {
  const { mapKey = '' } = useParams()
  const { pending, maps, pois, routes } = useTechnicalData()
  const deploy = useRecordDeployment()
  const reopen = useReopenLocalization()
  const [redeploying, setRedeploying] = useState(false)
  const map = maps.find((item) => item.mapKey === mapKey)

  if (pending) return <TechnicalPage><LoadingPanel label="Đang tải version map…" /></TechnicalPage>
  if (!map) return <TechnicalPage><Notice tone="warn">Không tìm thấy version {mapKey}. <Link to="/technical/maps" className="font-semibold underline">Về danh sách version</Link></Notice></TechnicalPage>

  const own = pois.filter((poi) => poi.mapKey === map.mapKey)
  const used = routes.filter((route) => route.mapKey === map.mapKey)
  const state = mapState(map)
  const loc = map.localization
  const locState = !map.deployedAt ? 'todo' : !loc ? 'doing' : loc.passed ? 'done' : 'fail'

  return (
    <TechnicalPage>
      <nav aria-label="Vị trí" className="mb-2 text-[12.5px] text-[#64748b]"><Link to="/technical/maps" className="hover:text-[#2d719e]">Version map</Link> / <span className="font-mono">{map.mapKey}</span></nav>
      <PageHeader eyebrow={map.area} title={map.mapKey} description={map.changeNote || 'Không ghi chú thay đổi.'} action={<ToneBadge tone={state.tone}>{state.label}</ToneBadge>} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,1fr)]">
        <div className="space-y-5">
          <section className={panelClass} aria-label="Xem trước map">
            <PanelHead title="Xem trước map" description={`${own.length} POI trên version này`} />
            <div className="space-y-3 p-5"><TechnicalMap mapKey={map.mapKey} pois={own} /><MapLegend /></div>
          </section>
          <section className={panelClass} aria-label="Tuyến dùng map">
            <PanelHead title="Ảnh hưởng" description="Tuyến đang gắn với version map này" />
            {used.length ? (
              <ul className="divide-y divide-[#f1f5f9]">
                {used.map((route) => (
                  <li key={route.id}><Link to={`/technical/confirmations/${route.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[#f8fafc]"><span className="font-semibold text-[#0f172a]">{routeLabel(route)}</span><ToneBadge tone={CONFIRMATION_STATE[route.state].tone}>{CONFIRMATION_STATE[route.state].label}</ToneBadge></Link></li>
                ))}
              </ul>
            ) : <p className="px-5 py-4 text-[13px] text-[#64748b]">Chưa có tuyến nào dùng version này. Staff chỉ chọn được map đã đạt localization.</p>}
          </section>
        </div>

        <section className={panelClass} aria-label="Bằng chứng kỹ thuật">
          <PanelHead title="Bằng chứng kỹ thuật" description="Ghi theo thứ tự; mỗi bước mở khi bước trước xong." />
          <div className="p-5">
            <EvidenceStep index={1} state="done" title="Upload">
              <Facts rows={[['Checksum', <span key="c" className="font-mono">{map.checksum}</span>], ['Dung lượng', map.packageSize], ['Người upload', `${map.uploadedBy} · ${stamp(map.uploadedAt)}`]]} />
            </EvidenceStep>
            <EvidenceStep index={2} state={map.deployedAt ? 'done' : 'doing'} title="Deploy lên robot">
              {map.deployedAt ? (
                <>
                  <Facts rows={[['Robot', map.deployedRobot ?? '—'], ['Thời điểm', stamp(map.deployedAt)], ['Checksum trên robot', <span key="ok" className="text-[#1f7a55]">Khớp</span>], ['Người ghi', map.deployedBy ?? '—']]} />
                  <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setRedeploying(true)}>Deploy lại</button>
                </>
              ) : <DeployForm map={map} />}
            </EvidenceStep>
            <EvidenceStep index={3} state={locState} title="Localization">
              {!map.deployedAt ? <Notice tone="muted">Ghi deploy trước, rồi mới đo localization.</Notice> : loc ? (
                <>
                  <div className="flex flex-wrap items-center gap-2"><ToneBadge tone={loc.passed ? 'ok' : 'danger'}>{loc.passed ? 'Đạt' : 'Không đạt'}</ToneBadge><span className="text-xs text-[#64748b]">lệch trung bình {loc.errorCm ?? '—'} cm · {stamp(loc.at)} · {loc.by}</span></div>
                  {loc.points.length > 0 && (
                    <table className="w-full text-left text-[13px]"><thead><tr className="text-xs text-[#64748b]"><th className="py-1 font-medium">Vị trí đo</th><th className="py-1 text-right font-medium">Sai lệch</th></tr></thead>
                      <tbody className="divide-y divide-[#f1f5f9]">{loc.points.map((point) => <tr key={point.label}><td className="py-1.5">{point.label}</td><td className="py-1.5 text-right tabular-nums">{point.errorCm} cm</td></tr>)}</tbody></table>
                  )}
                  {loc.note && <p className="text-[13px] text-[#64748b]">{loc.note}</p>}
                  <button type="button" className={buttonClass('secondary', 'sm')} disabled={reopen.isPending} onClick={() => reopen.mutate(map.mapKey)}>Đo lại</button>
                </>
              ) : <LocalizationForm map={map} />}
            </EvidenceStep>
          </div>
        </section>
      </div>

      <ConfirmationDialog
        open={redeploying}
        title={`Deploy lại ${map.mapKey}?`}
        description="Chỉ ghi khi robot đang chạy đúng file map của version này và checksum khớp. Kết quả localization hiện tại sẽ bị xóa và phải đo lại."
        confirmLabel="Ghi deploy lại"
        withReason={false}
        busy={deploy.isPending}
        error={deploy.error ? errorText(deploy.error) : null}
        onCancel={() => { setRedeploying(false); deploy.reset() }}
        onConfirm={() => deploy.mutate({ mapKey: map.mapKey, robot: map.deployedRobot ?? TECHNICAL_ROBOTS[0], checksumMatched: true }, { onSuccess: () => setRedeploying(false) })}
      />
    </TechnicalPage>
  )
}

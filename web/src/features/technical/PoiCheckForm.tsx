import { useState } from 'react'
import { buttonClass, inputClass, labelClass } from '../../components/ui/ui-classes'
import { useVerifyPoi } from './technical-hooks'
import { CAMERA_ANGLES, POI_SOURCE, POI_STATE, errorText, stamp } from './technical-format'
import { CheckRow, ChoiceGroup, Facts, Notice, ResultChoice, ToneBadge } from './TechnicalUi'
import type { CameraAngle, MapVersionStatus, TechnicalPoi } from './types'

/**
 * On-site check of one POI (SRS v1.9 §3.2.b, FR-49 camera angle). A pass needs
 * the robot at the spot, a camera angle and a correct frame; a fail is kept as
 * evidence for the next attempt.
 */
export function PoiCheckForm({ poi, map, onDone }: { poi: TechnicalPoi; map: MapVersionStatus | undefined; onDone: () => void }) {
  const verify = useVerifyPoi()
  const [arrived, setArrived] = useState(false)
  const [framingOk, setFramingOk] = useState(false)
  const [cameraAngle, setCameraAngle] = useState<CameraAngle | null>(poi.cameraAngle)
  const [errorCm, setErrorCm] = useState('')
  const [passed, setPassed] = useState<boolean | null>(null)
  const [note, setNote] = useState('')
  const localized = map?.localization?.passed === true
  const missing = passed === true ? [!arrived && 'robot tới đúng vị trí', !cameraAngle && 'góc camera', !framingOk && 'khung hình đúng'].filter(Boolean) : []
  const ready = localized && passed !== null && missing.length === 0 && !verify.isPending
  const state = POI_STATE[poi.state]

  const submit = () => {
    if (!ready || passed === null) return
    const cm = errorCm.trim() === '' ? null : Number(errorCm)
    verify.mutate({ id: poi.id, passed, arrived, framingOk, cameraAngle, errorCm: cm != null && Number.isFinite(cm) ? cm : null, note: note.trim() }, { onSuccess: onDone })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><ToneBadge tone={state.tone}>{state.label}</ToneBadge><span className="text-xs text-[#64748b]">rev {poi.revision} · {POI_SOURCE[poi.source]}</span></div>
      <Facts rows={[['Tọa độ (frame map)', `x ${poi.x} · y ${poi.y} · yaw ${poi.yaw}`], ['Góc camera hiện tại', poi.cameraAngle ?? '—']]} />
      {poi.lastCheck && <Notice tone={poi.lastCheck.passed ? 'muted' : 'danger'}>Lần trước ({stamp(poi.lastCheck.at)}, {poi.lastCheck.by}): {poi.lastCheck.note}</Notice>}
      {!localized && <Notice tone="warn">Map {poi.mapKey} chưa đạt localization. Đo localization trước khi xác minh POI.</Notice>}
      <form className={`space-y-4 ${localized ? '' : 'pointer-events-none opacity-50'}`} onSubmit={(event) => { event.preventDefault(); submit() }} aria-disabled={!localized}>
        <CheckRow checked={arrived} onChange={setArrived}>Robot tới đúng vị trí</CheckRow>
        <div>
          <label htmlFor={`poi-err-${poi.id}`} className={labelClass}>Sai lệch đo được (cm)</label>
          <input id={`poi-err-${poi.id}`} type="number" min={0} step={0.1} inputMode="decimal" value={errorCm} onChange={(event) => setErrorCm(event.target.value)} className={`${inputClass} mt-1.5`} />
        </div>
        <ChoiceGroup name={`camera-${poi.id}`} label="Góc camera (FR-49)" value={cameraAngle} options={CAMERA_ANGLES.map((angle) => ({ value: angle, label: angle }))} onChange={setCameraAngle} />
        <CheckRow checked={framingOk} onChange={setFramingOk}>Khung hình livestream đúng nội dung</CheckRow>
        <ResultChoice name={`result-${poi.id}`} value={passed} onChange={setPassed} />
        <div>
          <label htmlFor={`poi-note-${poi.id}`} className={labelClass}>Ghi chú</label>
          <textarea id={`poi-note-${poi.id}`} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: cửa phòng phải mở khi tour đi qua" className={`${inputClass} mt-1.5 resize-y`} />
        </div>
        {missing.length > 0 && <p className="text-[13px] text-[#b23e31]">Để ghi Đạt còn thiếu: {missing.join(', ')}.</p>}
        {verify.error && <p role="alert" className="text-[13px] font-semibold text-[#b23e31]">{errorText(verify.error)}</p>}
        <button type="submit" className={`${buttonClass('primary')} w-full`} disabled={!ready}>{verify.isPending ? 'Đang lưu…' : 'Lưu kết quả xác minh'}</button>
      </form>
    </div>
  )
}

import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { LoadingPanel, PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass, labelClass } from '../../components/ui/ui-classes'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { TECHNICAL_OPERATORS, useConfirmRoute, useRecordFailedTest, useRevokeConfirmation, useTechnicalData } from '../../features/technical/technical-hooks'
import { CONFIRMATION_STATE, POI_STATE, confirmationGaps, errorText, routeLabel, stamp } from '../../features/technical/technical-format'
import { CheckRow, Facts, Notice, ResultChoice, TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { TechnicalMap } from '../../features/technical/TechnicalMap'
import type { RouteVersionConfirmation, TechnicalPoi } from '../../features/technical/types'

/** Run the route with an operator, tick every leg and branch, then confirm or record a failed test. */
function RouteTestForm({ route, stops, gaps }: { route: RouteVersionConfirmation; stops: TechnicalPoi[]; gaps: string[] }) {
  const confirm = useConfirmRoute()
  const failed = useRecordFailedTest()
  const legs = stops.slice(1).map((stop, index) => `${stops[index].name} → ${stop.name}`)
  const [operator, setOperator] = useState('')
  const [legsDone, setLegsDone] = useState<boolean[]>(() => legs.map(() => false))
  const [branchesDone, setBranchesDone] = useState<boolean[]>(() => route.branches.map(() => false))
  const [passed, setPassed] = useState<boolean | null>(null)
  const [note, setNote] = useState('')
  const busy = confirm.isPending || failed.isPending
  const missing = [
    ...gaps,
    !operator && 'Chưa chọn người vận hành cùng chạy thử',
    legsDone.some((done) => !done) && `Còn ${legsDone.filter((done) => !done).length} chặng chưa tick`,
    branchesDone.some((done) => !done) && `Còn ${branchesDone.filter((done) => !done).length} nhánh chưa chạy thử`,
    passed !== true && 'Chưa chọn kết quả Đạt',
  ].filter((item): item is string => typeof item === 'string')
  const failing = passed === false
  const canSubmit = !busy && (failing ? !!operator : missing.length === 0)
  const error = confirm.error ?? failed.error
  const toggle = (list: boolean[], index: number, value: boolean) => list.map((item, i) => i === index ? value : item)

  const submit = () => {
    if (!canSubmit) return
    const input = { id: route.id, operator, note: note.trim() }
    if (failing) failed.mutate(input, { onSuccess: () => { setPassed(null); setNote('') } })
    else confirm.mutate(input)
  }

  return (
    <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); submit() }}>
      <div>
        <label htmlFor="route-operator" className={labelClass}>Người vận hành</label>
        <select id="route-operator" className={`${inputClass} mt-1.5`} value={operator} onChange={(event) => setOperator(event.target.value)}>
          <option value="">Chọn người vận hành</option>
          {TECHNICAL_OPERATORS.map((name) => <option key={name}>{name}</option>)}
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-[13px] font-medium text-[#334155]">Các chặng đã chạy thử</legend>
        {legs.map((leg, index) => <CheckRow key={leg} checked={legsDone[index]} onChange={(value) => setLegsDone((list) => toggle(list, index, value))}>Chặng {index + 1}: {leg}</CheckRow>)}
      </fieldset>
      {route.branches.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-[13px] font-medium text-[#334155]">Nhánh rẽ</legend>
          {route.branches.map((branch, index) => <CheckRow key={branch} checked={branchesDone[index]} onChange={(value) => setBranchesDone((list) => toggle(list, index, value))}>{branch}</CheckRow>)}
        </fieldset>
      )}
      <ResultChoice name="route-result" value={passed} onChange={setPassed} />
      <div>
        <label htmlFor="route-note" className={labelClass}>Ghi chú</label>
        <textarea id="route-note" rows={3} className={`${inputClass} mt-1.5 resize-y`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: chặng 3 robot giảm tốc đúng ở cửa phòng" />
      </div>
      {failing
        ? <Notice tone="danger">Tuyến giữ trạng thái hiện tại. Lần test không đạt được lưu vào lịch sử.</Notice>
        : missing.length > 0
          ? <div className="text-[13px]"><p className="font-semibold text-[#334155]">Còn thiếu:</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-[#b23e31]">{missing.map((item) => <li key={item}>{item}</li>)}</ul></div>
          : <Notice tone="ok">Đủ điều kiện. Xác nhận sẽ gắn với đúng bộ map–POI–tuyến hiện tại.</Notice>}
      {error && <p role="alert" className="text-[13px] font-semibold text-[#b23e31]">{errorText(error)}</p>}
      <button type="submit" className={`${buttonClass(failing ? 'danger' : 'primary')} w-full`} disabled={!canSubmit}>{busy ? 'Đang lưu…' : failing ? 'Ghi kết quả không đạt' : 'Xác nhận kỹ thuật'}</button>
      <p className="text-xs text-[#64748b]">Chỉ nhân viên kỹ thuật thấy nút này. Server từ chối nếu tài khoản Staff gọi xác nhận.</p>
    </form>
  )
}

/** One route version: what changed, where it goes, and its test and confirmation. */
export default function TechnicalRouteVersionPage() {
  const { id = '' } = useParams()
  const { pending, maps, pois, routes } = useTechnicalData()
  const revoke = useRevokeConfirmation()
  const [revoking, setRevoking] = useState(false)
  const route = routes.find((item) => item.id === id)

  if (pending) return <TechnicalPage><LoadingPanel label="Đang tải version tuyến…" /></TechnicalPage>
  if (!route) return <TechnicalPage><Notice tone="warn">Không tìm thấy version tuyến. <Link to="/technical/confirmations" className="font-semibold underline">Về danh sách</Link></Notice></TechnicalPage>

  const stops = route.stopIds.map((stop) => pois.find((poi) => poi.id === stop)).filter((poi): poi is TechnicalPoi => poi != null)
  const state = CONFIRMATION_STATE[route.state]
  const gaps = confirmationGaps(route, maps, pois)
  const movement = route.changes.some((change) => change.affectsMovement)

  return (
    <TechnicalPage>
      <nav aria-label="Vị trí" className="mb-2 text-[12.5px] text-[#64748b]"><Link to="/technical/confirmations" className="hover:text-[#2d719e]">Xác nhận tuyến</Link> / {routeLabel(route)}</nav>
      <PageHeader eyebrow={`${route.mapKey} · ${stops.length} điểm dừng`} title={routeLabel(route)} description={route.blockingSession ? `Đang chặn ${route.blockingSession}. ${route.stateNote ?? ''}` : route.stateNote ?? 'Version đã được kiểm tra thực tế.'} action={<ToneBadge tone={state.tone}>{state.label}</ToneBadge>} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,1fr)]">
        <div className="space-y-5">
          {route.previousVersion && (
            <section className={panelClass} aria-label="Thay đổi">
              <PanelHead title={`Thay đổi so với v${route.previousVersion}`} />
              <ul className="divide-y divide-[#f1f5f9]">
                {route.changes.map((change) => (
                  <li key={change.text} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[13.5px]"><span>{change.text}</span><ToneBadge tone={change.affectsMovement ? 'danger' : 'muted'}>{change.affectsMovement ? 'Ảnh hưởng di chuyển' : 'Chỉ nội dung'}</ToneBadge></li>
                ))}
              </ul>
              <div className="px-5 pb-4">{route.inheritedFrom ? <Notice tone="ok">Chỉ đổi thuyết minh, nên giữ xác nhận của v{route.inheritedFrom} và không cần chạy lại navigation.</Notice> : movement ? <Notice tone="danger">Có thay đổi ảnh hưởng di chuyển, nên phải test lại toàn tuyến.</Notice> : null}</div>
            </section>
          )}
          <section className={panelClass} aria-label="Lộ trình">
            <PanelHead title="Lộ trình" />
            <div className="p-5"><TechnicalMap mapKey={route.mapKey} pois={stops} route={route.stopIds} /></div>
          </section>
          <section className={panelClass} aria-label="Điểm dừng">
            <PanelHead title="Điểm dừng" />
            <ol className="divide-y divide-[#f1f5f9]">
              {stops.map((poi, index) => (
                <li key={poi.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e5f3ff] text-xs font-bold text-[#174b70]">{index + 1}</span>
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-[#0f172a]">{poi.name}</span><span className="block text-xs text-[#64748b]">{poi.cameraAngle ? `Camera ${poi.cameraAngle}` : 'Chưa chọn góc camera'}</span></span>
                  <ToneBadge tone={POI_STATE[poi.state].tone}>{POI_STATE[poi.state].label}</ToneBadge>
                  {poi.state !== 'VERIFIED' && <Link to={`/technical/pois?map=${poi.mapKey}&poi=${poi.id}`} className={buttonClass('secondary', 'sm')}>Xác minh</Link>}
                </li>
              ))}
            </ol>
          </section>
          <section className={panelClass} aria-label="Lịch sử">
            <PanelHead title="Lịch sử" />
            <ul className="divide-y divide-[#f1f5f9]">{route.history.map((entry) => <li key={`${entry.at}-${entry.text}`} className="flex gap-4 px-5 py-3 text-[13px]"><span className="w-24 shrink-0 text-[#64748b] tabular-nums">{stamp(entry.at)}</span><span>{entry.text}</span></li>)}</ul>
          </section>
        </div>

        {route.state === 'CONFIRMED' ? (
          <section className={panelClass} aria-label="Xác nhận kỹ thuật">
            <PanelHead title="Xác nhận kỹ thuật" action={<ToneBadge tone="ok">Đã xác nhận</ToneBadge>} />
            <div className="space-y-4 p-5">
              <Facts rows={[['Người xác nhận', route.confirmedBy ?? '—'], ['Thời điểm', stamp(route.confirmedAt)], ['Chạy thử cùng', route.testedWith ?? '—'], ['Bộ version', `${route.mapKey} · ${stops.length} POI · v${route.routeVersion}`]]} />
              {route.note && <p className="text-[13px] text-[#64748b]">{route.note}</p>}
              <button type="button" className={buttonClass('danger')} onClick={() => setRevoking(true)}>Thu hồi xác nhận</button>
            </div>
          </section>
        ) : (
          <section className={panelClass} aria-label="Test cùng người vận hành">
            <PanelHead title="Test cùng người vận hành" />
            <RouteTestForm key={route.id} route={route} stops={stops} gaps={gaps} />
          </section>
        )}
      </div>

      <ConfirmationDialog
        open={revoking}
        tone="danger"
        title={`Thu hồi xác nhận ${routeLabel(route)}?`}
        description="Tuyến chuyển về chưa xác nhận và bị chặn xếp lịch cho tới khi xác nhận lại. Thao tác được ghi vào nhật ký."
        confirmLabel="Thu hồi"
        requireReason
        busy={revoke.isPending}
        error={revoke.error ? errorText(revoke.error) : null}
        onCancel={() => { setRevoking(false); revoke.reset() }}
        onConfirm={(reason) => revoke.mutate({ id: route.id, reason }, { onSuccess: () => setRevoking(false) })}
      />
    </TechnicalPage>
  )
}

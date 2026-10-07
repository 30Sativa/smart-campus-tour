import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, Check, ChevronDown, RotateCcw, Save, TriangleAlert } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { AdminErrorPanel, AdminPage, Notice } from '../../features/administration/AdminUi'
import { poiRequestError } from '../../features/administration/pois/errors'
import { useCreatePoi, usePoi, useSetPoiActive, useUpdatePoi } from '../../features/administration/pois/hooks'
import type { CreatePoiInput, PoiDetails } from '../../features/administration/pois/types'
import { DEFAULT_POI_MAP, OCCUPANCY_MAPS, occupancyMapFor, type OccupancyMap } from '../../features/administration/pois/map/catalog'
import { PoiPosePicker, type PickerMode, type PickerPose } from '../../features/administration/pois/map/PoiPosePicker'
import { YawDial } from '../../features/administration/pois/map/YawDial'
import { cellAtPose, rosToImage } from '../../features/administration/pois/map/occupancy-grid'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { inputClass, labelClass, buttonClass } from '../../components/ui/ui-classes'
import { PageHeader, LoadingPanel } from '../../components/ui/ConsolePrimitives'
import '../../features/administration/pois/poi-form.css'

type PoiForm = {
  name: string
  description: string
  mapKey: string
  mapFrame: string
  x: string
  y: string
  yaw: string
  narrationText: string
  audioUrl: string
  narrationSeconds: string
  fallbackVideoUrl: string
}

type PoiDraft = {
  form: PoiForm
  rowVersion: string
}

const EMPTY_FORM: PoiForm = {
  name: '', description: '', mapKey: DEFAULT_POI_MAP.mapKey, mapFrame: DEFAULT_POI_MAP.frameId, x: '', y: '', yaw: '',
  narrationText: '', audioUrl: '', narrationSeconds: '', fallbackVideoUrl: '',
}

/** Rough Vietnamese narration pace (~155 words per minute) for the duration hint. */
const WORDS_PER_SECOND = 2.6

const cardClass = 'rounded-[20px] border border-[#d9e9f5] bg-white shadow-[0_12px_32px_-30px_#285c7d] transition-[border-color,box-shadow] duration-300 focus-within:border-[#a8cde6] focus-within:shadow-[0_18px_40px_-30px_#285c7d]'

function fromPoi(poi: PoiDetails): PoiForm {
  return {
    name: poi.name,
    description: poi.description ?? '',
    mapKey: poi.mapKey,
    mapFrame: poi.mapFrame,
    x: String(poi.x),
    y: String(poi.y),
    yaw: String(poi.yaw),
    narrationText: poi.narrationText ?? '',
    audioUrl: poi.audioUrl ?? '',
    narrationSeconds: poi.narrationSeconds == null ? '' : String(poi.narrationSeconds),
    fallbackVideoUrl: poi.fallbackVideoUrl ?? '',
  }
}

function optional(value: string): string | null {
  const trimmed = value.trim()
  return trimmed || null
}

function numberValue(value: string): number | null {
  if (!value.trim()) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export default function AdminPoiFormPage() {
  const { poiId } = useParams()
  const isCreate = !poiId
  const poi = usePoi(poiId)
  const pageTitle = isCreate ? 'Tạo POI' : 'Chi tiết POI'

  if (!isCreate && poi.isPending) return <AdminPage><PageHeader eyebrow="Danh mục POI" title={pageTitle} description="Đang tải dữ liệu POI." /><LoadingPanel label="Đang tải POI…" /></AdminPage>
  if (!isCreate && poi.isError && !poi.data) return <AdminPage><PageHeader eyebrow="Danh mục POI" title={pageTitle} description="Không tải được chi tiết POI." /><AdminErrorPanel title={poiRequestError(poi.error, 'Không thể tải POI.')} onRetry={() => void poi.refetch()} /></AdminPage>
  if (!isCreate && !poi.data) return <AdminPage><AdminErrorPanel title="Không tìm thấy POI." /><Link to="/admin/pois" className={buttonClass('secondary')}><ArrowLeft size={15} aria-hidden="true" />Về danh sách POI</Link></AdminPage>

  return <PoiForm key={poiId ?? 'new'} isCreate={isCreate} poi={poi} />
}

function PoiForm({ isCreate, poi }: { isCreate: boolean; poi: ReturnType<typeof usePoi> }) {
  const navigate = useNavigate()
  const create = useCreatePoi()
  const update = useUpdatePoi()
  const setActive = useSetPoiActive()
  const [draft, setDraft] = useState<PoiDraft>(() => ({
    form: poi.data ? fromPoi(poi.data) : EMPTY_FORM,
    rowVersion: poi.data?.rowVersion ?? '',
  }))
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmAvailability, setConfirmAvailability] = useState(false)
  const [pickerMode, setPickerMode] = useState<PickerMode>(isCreate ? 'position' : 'pan')
  const form = draft.form
  const selectedMap = occupancyMapFor(form.mapKey, form.mapFrame)
  const pickerPose: PickerPose = { x: numberValue(form.x), y: numberValue(form.y), yaw: numberValue(form.yaw) }

  const busy = create.isPending || update.isPending
  const editable = isCreate || poi.data?.usage.canEditContentAndAvailability === true
  const poseEditable = isCreate || poi.data?.usage.canEditPose === true
  const pageTitle = isCreate ? 'Tạo POI' : 'Chi tiết POI'
  const picking = poseEditable && pickerMode !== 'pan'
  const change = (field: keyof PoiForm, value: string) => {
    setDraft((current) => ({
      form: { ...current.form, [field]: value },
      rowVersion: current.rowVersion,
    }))
    setFormError(null)
    create.reset()
    update.reset()
    if (field === 'x' || field === 'y' || field === 'yaw') setPickerMode('pan')
  }

  const selectMap = (mapKey: string) => {
    if (!poseEditable || busy) return
    const map = OCCUPANCY_MAPS.find((entry) => entry.mapKey === mapKey)
    if (!map) return
    setDraft((current) => ({ ...current, form: { ...current.form, mapKey: map.mapKey, mapFrame: map.frameId, x: '', y: '', yaw: '' } }))
    setPickerMode('position')
    setFormError(null)
    create.reset()
    update.reset()
  }

  const changePose = (pose: PickerPose) => {
    if (!poseEditable || busy) return
    setDraft((current) => ({ ...current, form: { ...current.form, x: pose.x == null ? '' : String(pose.x), y: pose.y == null ? '' : String(pose.y), yaw: pose.yaw == null ? '' : String(pose.yaw) } }))
    setFormError(null)
    create.reset()
    update.reset()
  }

  const reload = async () => {
    if (!isCreate) {
      const result = await poi.refetch()
      if (result.data) {
        setDraft({ form: fromPoi(result.data), rowVersion: result.data.rowVersion })
      }
    }
    create.reset()
    update.reset()
    setFormError(null)
    setPickerMode('pan')
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    if (!form.name.trim()) return setFormError('Nhập tên POI.')
    if (!form.mapKey.trim() || !form.mapFrame.trim()) return setFormError('Nhập MapKey và MapFrame.')
    const x = numberValue(form.x)
    const y = numberValue(form.y)
    const yaw = numberValue(form.yaw)
    if (x == null || y == null || yaw == null) return setFormError('Nhập x, y và yaw bằng số hợp lệ.')
    if (poseEditable && pickerMode !== 'pan') return setFormError('Chốt vị trí và hướng, hoặc hủy thao tác chọn trên bản đồ trước khi lưu.')
    if (poseEditable && (Math.abs(x) > 999999.9999 || Math.abs(y) > 999999.9999)) return setFormError('x và y phải nằm trong giới hạn số của hệ thống.')
    if (poseEditable && (yaw < -3.141593 || yaw > 3.141593)) return setFormError('Yaw phải nằm trong khoảng −π đến π radian.')
    const poseChanged = isCreate || !poi.data || form.mapKey !== poi.data.mapKey || form.mapFrame !== poi.data.mapFrame ||
      x !== poi.data.x || y !== poi.data.y || yaw !== poi.data.yaw
    if (poseEditable && poseChanged) {
      if (Number(x.toFixed(4)) !== x || Number(y.toFixed(4)) !== y) return setFormError('X/Y chỉ nhận tối đa 4 chữ số thập phân.')
      if (Number(yaw.toFixed(6)) !== yaw) return setFormError('Yaw chỉ nhận tối đa 6 chữ số thập phân.')
      if (selectedMap && !cellAtPose(selectedMap, { x, y })) return setFormError('Pose nằm ngoài phạm vi bản đồ đã chọn.')
    }
    const seconds = form.narrationSeconds.trim() ? numberValue(form.narrationSeconds) : null
    if (form.narrationSeconds.trim() && (seconds == null || !Number.isInteger(seconds) || seconds <= 0)) return setFormError('Thời lượng narration phải là số giây nguyên lớn hơn 0.')

    const input: CreatePoiInput = {
      name: form.name.trim(),
      description: optional(form.description),
      mapKey: form.mapKey.trim(),
      mapFrame: form.mapFrame.trim(),
      x,
      y,
      yaw,
      narrationText: optional(form.narrationText),
      audioUrl: optional(form.audioUrl),
      narrationSeconds: seconds,
      fallbackVideoUrl: optional(form.fallbackVideoUrl),
    }

    if (isCreate) {
      create.mutate(input, {
        onSuccess: (response) => {
          const id = response.data?.id
          if (id) navigate(`/admin/pois/${id}`, { replace: true })
          else navigate('/admin/pois', { replace: true })
        },
      })
    } else if (poi.data && !isCreate) {
      update.mutate({ id: poi.data.id, input: { ...input, expectedRowVersion: draft.rowVersion } }, {
        onSuccess: async () => {
          const result = await poi.refetch()
          if (result.data) {
            setDraft({ form: fromPoi(result.data), rowVersion: result.data.rowVersion })
          }
          setPickerMode('pan')
        },
      })
    }
  }

  const confirmActive = () => {
    if (!poi.data) return
    setActive.mutate({ id: poi.data.id, version: poi.data.rowVersion, isActive: !poi.data.isActive }, {
      onSuccess: () => {
        setConfirmAvailability(false)
        void poi.refetch()
      },
    })
  }

  const requestError = create.isError
    ? poiRequestError(create.error, 'Không thể tạo POI.')
    : update.isError
      ? poiRequestError(update.error, 'Không thể cập nhật POI.')
      : null

  // Readiness, derived from the draft only; the server still re-checks on save.
  const x = pickerPose.x
  const y = pickerPose.y
  const yaw = pickerPose.yaw
  const hasPosition = x != null && y != null && (!selectedMap || cellAtPose(selectedMap, { x, y }) != null)
  const hasYaw = yaw != null && yaw >= -3.141593 && yaw <= 3.141593 && !picking
  const words = form.narrationText.trim() ? form.narrationText.trim().split(/\s+/).length : 0
  const estimatedSeconds = words ? Math.max(1, Math.round(words / WORDS_PER_SECOND)) : null
  const checks: ReadinessItem[] = [
    { target: 'poi-section-info', label: 'Tên POI', done: !!form.name.trim(), note: form.name.trim() || 'Bắt buộc' },
    { target: 'poi-section-pose', label: 'Vị trí trên bản đồ', done: hasPosition, note: hasPosition ? `${x!.toFixed(2)}, ${y!.toFixed(2)}` : 'Bắt buộc' },
    { target: 'poi-section-pose', label: 'Hướng thân (yaw)', done: hasYaw, note: hasYaw ? `${(yaw! * 180 / Math.PI).toFixed(0)}°` : picking ? 'Đang chọn' : 'Bắt buộc' },
    { target: 'poi-section-content', label: 'Narration', done: words > 0, note: words ? `${words} từ` : 'Không bắt buộc', optional: true },
    { target: 'poi-section-content', label: 'Audio', done: !!form.audioUrl.trim(), note: form.audioUrl.trim() ? 'Đã gắn' : 'Không bắt buộc', optional: true },
  ]
  const missing = checks.filter((item) => !item.optional && !item.done)
  const submitHint = !editable
    ? 'POI đang bị khóa, không thể lưu.'
    : picking
      ? 'Đang chọn trên bản đồ: chốt hướng thân hoặc bấm “Di chuyển bản đồ” để dừng chọn.'
      : missing.length
        ? `Còn thiếu: ${missing.map((item) => item.label).join(', ')}.`
        : isCreate ? 'POI mới được tạo ở trạng thái không khả dụng.' : 'Thay đổi được kiểm tra lại theo Route và Tour khi lưu.'

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Danh mục POI"
        title={isCreate ? 'Tạo POI' : poi.data!.name}
        description={isCreate ? 'Tạo định danh và nội dung ban đầu. POI mới luôn ở trạng thái không khả dụng.' : 'Cập nhật POI trên cùng mã định danh; thay đổi được kiểm tra lại theo Route và Tour.'}
        action={<Link to="/admin/pois" className={buttonClass('secondary')}><ArrowLeft size={16} aria-hidden="true" />Danh sách POI</Link>}
      />

      <div className="mb-5 space-y-3">
        <Notice tone="warn"><span className="font-semibold">Pose chưa được xác minh bằng robot thật.</span> Chọn trên bản đồ ROS chỉ lưu vị trí và hướng thân. Ô trống chưa chứng minh robot có thể tới POI.</Notice>
        {!isCreate && poi.data!.usage.hasReadyOrRunningTours && <Notice tone="danger">Tour READY/RUNNING đang dùng POI này. Mọi thao tác cập nhật và bật/tắt đều bị khóa.</Notice>}
        {!isCreate && !poi.data!.usage.canEditPose && !poi.data!.usage.hasReadyOrRunningTours && <Notice tone="info">Map và pose đã khóa vì POI được Route hoặc lịch sử tham chiếu; tên, mô tả và nội dung vẫn sửa được.</Notice>}
        {formError && <div className="poi-shake"><Notice tone="danger">{formError}</Notice></div>}
        {requestError && <Notice tone="danger" action={(update.isError || create.isError) && <button type="button" onClick={() => { void reload() }} className={buttonClass('secondary', 'sm')}><RotateCcw size={14} aria-hidden="true" />Tải lại</button>}>{requestError}</Notice>}
      </div>

      <form noValidate onSubmit={submit} aria-label={pageTitle} className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <FormSection id="poi-section-info" step={1} done={!!form.name.trim()} title="Thông tin POI" description="Tên là nhãn hiển thị; hệ thống giữ ID bất biến." tag="Bắt buộc" delay={0}>
            <Field label="Tên POI" htmlFor="poi-name" extra={<span className="text-xs font-semibold text-[#dc2626]" aria-hidden="true">*</span>}>
              <div className="relative">
                <input id="poi-name" maxLength={150} required disabled={!editable} value={form.name} onChange={(event) => change('name', event.target.value)} placeholder="Ví dụ: Thư viện trung tâm" className={`${inputClass} pr-16`} />
                <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[11px] text-[#94a8b8] tabular-nums">{form.name.length}/150</span>
              </div>
            </Field>
            <Field label="Mô tả" htmlFor="poi-description" extra={<span className="text-[11.5px] text-[#94a8b8]">không bắt buộc</span>}>
              <div className="relative">
                <textarea id="poi-description" maxLength={2000} rows={3} disabled={!editable} value={form.description} onChange={(event) => change('description', event.target.value)} placeholder="Một vài câu giới thiệu điểm tham quan." className={`${inputClass} resize-y pb-6`} />
                <span aria-hidden="true" className="pointer-events-none absolute right-3 bottom-2.5 font-mono text-[11px] text-[#94a8b8] tabular-nums">{form.description.length}/2000</span>
              </div>
            </Field>
          </FormSection>

          <FormSection id="poi-section-pose" step={2} done={hasPosition && hasYaw} title="Map và pose" description="X/Y tính bằng mét; yaw bằng radian trong khoảng −π đến π." tag="Bắt buộc" delay={60}>
            <Field label="Bản đồ" htmlFor="poi-map" hint={poseEditable ? 'Đổi bản đồ sẽ xóa pose trong bản nháp và yêu cầu chọn lại vị trí, hướng.' : undefined}>
              <select id="poi-map" disabled={!poseEditable || busy} value={selectedMap?.mapKey ?? '__stored__'} onChange={(event) => selectMap(event.target.value)} className={inputClass}>
                {!selectedMap && <option value="__stored__">{form.mapKey} / {form.mapFrame} (chưa có bản đồ tương ứng)</option>}
                {OCCUPANCY_MAPS.map((map) => <option key={map.mapKey} value={map.mapKey}>Map 2 ({map.mapKey}, frame {map.frameId})</option>)}
              </select>
            </Field>
            {selectedMap ? <PoiPosePicker key={selectedMap.fingerprint} map={selectedMap} pose={pickerPose} editable={poseEditable && !busy} mode={pickerMode} onModeChange={setPickerMode} onPoseChange={changePose} /> : <Notice tone="info">Chưa có ảnh cho đúng map/frame này. Hệ thống giữ nguyên tọa độ đã lưu và không hiển thị chúng trên bản đồ khác.</Notice>}

            <div className="rounded-2xl border border-[#e2e8f0] bg-[#fbfdff] p-4">
              <YawDial yaw={yaw} disabled={!poseEditable || busy || !hasPosition} onChange={(value) => change('yaw', String(value))} />
              {poseEditable && !hasPosition && <p className="mt-3 text-xs text-[#7c94a7]">Chọn vị trí trước, sau đó đặt hướng thân.</p>}
            </div>

            <details open={isCreate || !selectedMap || !poseEditable} className="group rounded-2xl border border-[#e2e8f0]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-[#334155] [&::-webkit-details-marker]:hidden">
                Tinh chỉnh tọa độ
                <ChevronDown size={16} className="text-[#86a0b3] transition-transform duration-300 group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
                <Field label="MapKey" htmlFor="poi-map-key"><input id="poi-map-key" readOnly disabled={!poseEditable} value={form.mapKey} className={`${inputClass} bg-[#f8fafc] font-mono`} /></Field>
                <Field label="MapFrame" htmlFor="poi-map-frame"><input id="poi-map-frame" readOnly disabled={!poseEditable} value={form.mapFrame} className={`${inputClass} bg-[#f8fafc] font-mono`} /></Field>
                <Field label="X (m)" htmlFor="poi-x"><input id="poi-x" type="number" step="0.0001" required disabled={!poseEditable || busy} value={form.x} onChange={(event) => change('x', event.target.value)} className={`${inputClass} font-mono tabular-nums`} /></Field>
                <Field label="Y (m)" htmlFor="poi-y"><input id="poi-y" type="number" step="0.0001" required disabled={!poseEditable || busy} value={form.y} onChange={(event) => change('y', event.target.value)} className={`${inputClass} font-mono tabular-nums`} /></Field>
                <div className="sm:col-span-2"><Field label="Yaw (rad)" htmlFor="poi-yaw"><input id="poi-yaw" type="number" step="0.000001" min="-3.141593" max="3.141593" required disabled={!poseEditable || busy} value={form.yaw} onChange={(event) => change('yaw', event.target.value)} className={`${inputClass} font-mono tabular-nums`} /></Field></div>
              </div>
            </details>
            {!poseEditable && <p className="rounded-xl bg-[#f4f8fb] px-3 py-2 text-xs text-[#647b8d]">Pose bị khóa theo lịch sử sử dụng, không chỉ theo trạng thái IsActive.</p>}
          </FormSection>

          <FormSection id="poi-section-content" step={3} done={words > 0} title="Narration và nội dung" description="Các trường này không bắt buộc khi tạo POI; upload audio được để cho bước riêng." tag="Không bắt buộc" delay={120}>
            <Field label="Narration text" htmlFor="poi-narration"><textarea id="poi-narration" rows={5} disabled={!editable} value={form.narrationText} onChange={(event) => change('narrationText', event.target.value)} placeholder="Lời thuyết minh robot đọc khi dừng tại POI." className={`${inputClass} resize-y`} /></Field>
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-[#f1f7fc] px-3 py-2.5 text-[12.5px] text-[#54738a] ${words ? 'poi-wave-on' : ''}`}>
              <span className="poi-wave" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map((bar) => <i key={bar} style={{ animationDelay: `${bar * 0.1}s` }} />)}</span>
              {words ? <span><b className="text-[#173b59]">{words} từ</b> · đọc khoảng <b className="text-[#173b59]">{estimatedSeconds} giây</b></span> : <span>Chưa có lời thuyết minh.</span>}
              {estimatedSeconds != null && editable && numberValue(form.narrationSeconds) !== estimatedSeconds && <button type="button" onClick={() => change('narrationSeconds', String(estimatedSeconds))} className={buttonClass('ghost', 'sm')}>Dùng ước tính</button>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Audio URL / asset key" htmlFor="poi-audio-url"><input id="poi-audio-url" maxLength={1000} disabled={!editable} value={form.audioUrl} onChange={(event) => change('audioUrl', event.target.value)} placeholder="poi-library-vi" className={`${inputClass} font-mono`} /></Field>
              <Field label="Thời lượng narration (giây)" htmlFor="poi-narration-seconds"><input id="poi-narration-seconds" type="number" step="1" min="1" disabled={!editable} value={form.narrationSeconds} onChange={(event) => change('narrationSeconds', event.target.value)} className={`${inputClass} font-mono tabular-nums`} /></Field>
            </div>
            <Field label="Fallback video URL" htmlFor="poi-fallback-video" hint="Phát cho học sinh khi mất nguồn hình tại POI này."><input id="poi-fallback-video" maxLength={1000} disabled={!editable} value={form.fallbackVideoUrl} onChange={(event) => change('fallbackVideoUrl', event.target.value)} placeholder="https://…" className={`${inputClass} font-mono`} /></Field>
          </FormSection>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20" aria-label="Xem trước và kiểm tra">
          <PoiPreview map={selectedMap} name={form.name} description={form.description} pose={pickerPose} seconds={form.narrationSeconds} hasAudio={!!form.audioUrl.trim()} active={!isCreate && poi.data!.isActive} />

          <section className={`${cardClass} poi-rise p-4`} style={{ animationDelay: '120ms' }} aria-labelledby="poi-ready-heading">
            <ReadinessRing done={checks.filter((item) => !item.optional && item.done).length} total={checks.filter((item) => !item.optional).length} />
            <ul className="my-3 space-y-0.5">
              {checks.map((item) => (
                <li key={item.label}>
                  <a href={`#${item.target}`} onClick={(event) => { event.preventDefault(); document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-[#173b59] transition-colors hover:bg-[#f1f7fc]">
                    <span className={`grid size-5.5 place-items-center rounded-full border-[1.5px] transition-all duration-300 ${item.done ? 'border-[#2f7a5b] bg-[#2f7a5b] text-white' : 'border-[#cbdbe8] text-transparent'}`} aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
                    <span>{item.label}<span className="sr-only">{item.done ? ': đã xong' : item.optional ? ': không bắt buộc' : ': chưa xong'}</span></span>
                    <span className={`max-w-28 truncate text-[11px] font-semibold ${item.optional && !item.done ? 'text-[#a3b4c2]' : 'text-[#86a0b3]'}`} aria-hidden="true">{item.note}</span>
                  </a>
                </li>
              ))}
            </ul>
            <button type="submit" disabled={busy || !editable || (poseEditable && pickerMode !== 'pan')} aria-describedby="poi-submit-hint" className={`${buttonClass('primary', 'lg')} w-full`}><Save size={16} aria-hidden="true" />{create.isPending ? 'Đang tạo…' : update.isPending ? 'Đang lưu…' : isCreate ? 'Tạo POI không khả dụng' : 'Lưu thay đổi'}</button>
            <p id="poi-submit-hint" className="mt-2 text-center text-xs leading-5 text-[#7c94a7]">{submitHint}</p>
            <Link to="/admin/pois" className={`${buttonClass('secondary')} mt-2 w-full`}>Hủy</Link>
          </section>

          {!isCreate && <section className={`${cardClass} p-5`}>
            <h2 className="font-bold text-[#173b59]">Khả dụng và mức sử dụng</h2>
            <div className="mt-3 flex items-center gap-2 text-sm">{poi.data!.isActive ? <Check size={16} className="text-[#2f7a5b]" aria-hidden="true" /> : <TriangleAlert size={16} className="text-[#b7791f]" aria-hidden="true" />}<span className="font-semibold">{poi.data!.isActive ? 'Có thể chọn cho Route mới' : 'Không khả dụng cho Route mới'}</span></div>
            <p className="mt-2 text-xs leading-5 text-[#647b8d]">Trạng thái này không xác nhận tính đầy đủ của nội dung hoặc khả năng điều hướng vật lý.</p>
            <ul className="mt-4 space-y-2 border-t border-[#eef3f7] pt-3 text-xs text-[#526d82]">
              <li>{poi.data!.usage.hasRouteStopReferences ? 'Được RouteStop tham chiếu' : 'Chưa có RouteStop tham chiếu'}</li>
              <li>{poi.data!.usage.hasHistoricalTourReferences ? 'Có lịch sử Tour' : 'Chưa có lịch sử Tour'}</li>
              <li>{poi.data!.usage.hasReadyOrRunningTours ? 'Tour READY/RUNNING đang dùng' : 'Không có Tour READY/RUNNING đang dùng'}</li>
            </ul>
            <button type="button" disabled={!editable || setActive.isPending} onClick={() => setConfirmAvailability(true)} className={`${buttonClass(poi.data!.isActive ? 'danger' : 'secondary')} mt-4 w-full`}>
              {setActive.isPending ? 'Đang cập nhật…' : poi.data!.isActive ? 'Vô hiệu hóa POI' : 'Kích hoạt POI'}
            </button>
            {setActive.isError && <div className="mt-2 space-y-2" role="alert"><p className="text-xs text-[#b23e31]">{poiRequestError(setActive.error, 'Không thể đổi trạng thái POI.')}</p><button type="button" onClick={() => { void poi.refetch(); setActive.reset() }} className={buttonClass('secondary', 'sm')}><RotateCcw size={13} aria-hidden="true" />Tải lại trạng thái</button></div>}
          </section>}

          <section className="rounded-[20px] border border-[#d9e9f5] bg-[#f7fbfe] p-5">
            <h2 className="font-bold text-[#173b59]">POI không đồng nghĩa Route-ready</h2>
            <p className="mt-2 text-[13px] leading-6 text-[#647b8d]">Route và RouteStop do kỹ thuật chuẩn bị. Một POI có thể tồn tại khi chưa có narration hoặc chưa được kiểm tra đường đi; không dùng IsActive làm bằng chứng robot có thể tới điểm.</p>
          </section>
        </aside>
      </form>

      {!isCreate && <ConfirmationDialog
        open={confirmAvailability}
        title={poi.data!.isActive ? 'Vô hiệu hóa POI?' : 'Kích hoạt POI?'}
        description={poi.data!.isActive ? 'POI sẽ không còn được chọn khi chuẩn bị Route mới. Các Route và lịch sử hiện có vẫn giữ nguyên.' : 'POI có thể được chọn khi chuẩn bị Route mới. Việc này không xác minh tọa độ hoặc đường đi.'}
        confirmLabel={poi.data!.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}
        tone={poi.data!.isActive ? 'danger' : 'default'}
        withReason={false}
        busy={setActive.isPending}
        busyLabel="Đang lưu…"
        error={setActive.isError ? poiRequestError(setActive.error, 'Không thể đổi trạng thái POI.') : null}
        onConfirm={confirmActive}
        onCancel={() => { setConfirmAvailability(false); setActive.reset() }}
      />}
    </AdminPage>
  )
}

type ReadinessItem = { target: string; label: string; done: boolean; note: string; optional?: boolean }

function FormSection({ id, step, done, title, description, tag, delay, children }: { id: string; step: number; done: boolean; title: string; description: string; tag: string; delay: number; children: ReactNode }) {
  const headingId = `${id}-heading`
  return (
    <section id={id} aria-labelledby={headingId} className={`${cardClass} poi-rise scroll-mt-24`} style={{ animationDelay: `${delay}ms` }}>
      <header className="flex items-start gap-3.5 px-5 pt-5 sm:px-6">
        <span aria-hidden="true" className={`grid size-8.5 shrink-0 place-items-center rounded-[11px] border-[1.5px] font-mono text-[13px] font-semibold transition-all duration-300 ${done ? 'border-[#2d719e] bg-[#2d719e] text-white' : 'border-[#d9e9f5] bg-[#f1f7fc] text-[#54738a]'}`}>
          {done ? <Check size={16} strokeWidth={3} className="poi-pop" /> : String(step).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="font-bold tracking-[-0.02em] text-[#173b59]">{title}</h2>
          <p className="mt-0.5 text-xs text-[#7c94a7]">{description}</p>
        </div>
        <span className="hidden shrink-0 rounded-full bg-[#f1f7fc] px-2.5 py-0.5 text-[11px] font-bold text-[#54738a] sm:inline">{tag}</span>
      </header>
      <div className="space-y-4 px-5 pt-4 pb-5 sm:px-6 sm:pb-6">{children}</div>
    </section>
  )
}

function Field({ label, htmlFor, hint, extra, children }: { label: string; htmlFor: string; hint?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2"><label htmlFor={htmlFor} className={labelClass}>{label}</label>{extra}</div>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-[#7c94a7]">{hint}</p>}
    </div>
  )
}

function ReadinessRing({ done, total }: { done: number; total: number }) {
  const circumference = 2 * Math.PI * 25
  return (
    <div className="flex items-center gap-3.5">
      <div className="relative size-15 shrink-0">
        <svg viewBox="0 0 60 60" className="size-15 -rotate-90" aria-hidden="true">
          <circle cx={30} cy={30} r={25} fill="none" stroke="#e5eef6" strokeWidth={6} />
          <circle cx={30} cy={30} r={25} fill="none" stroke="#2d719e" strokeWidth={6} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - done / total)} className="transition-[stroke-dashoffset] duration-700 ease-out" />
        </svg>
        <span className="absolute inset-0 grid place-items-center font-mono text-sm font-semibold text-[#173b59]">{done}/{total}</span>
      </div>
      <div>
        <h2 id="poi-ready-heading" className="text-[15px] font-bold text-[#173b59]">Mức sẵn sàng</h2>
        <p className="text-xs text-[#54738a]">{done === total ? 'Đủ mục bắt buộc. Narration có thể bổ sung sau.' : 'Hoàn thành các mục bắt buộc.'}</p>
      </div>
    </div>
  )
}

function PoiPreview({ map, name, description, pose, seconds, hasAudio, active }: { map: OccupancyMap | null; name: string; description: string; pose: PickerPose; seconds: string; hasAudio: boolean; active: boolean }) {
  const inside = map && pose.x != null && pose.y != null && cellAtPose(map, { x: pose.x, y: pose.y }) != null
  const point = inside ? rosToImage(map, { x: pose.x!, y: pose.y! }) : null
  const width = 760
  const height = width * 150 / 340
  const viewBox = point ? `${point.u - width / 2} ${point.v - height / 2} ${width} ${height}` : map ? `0 ${map.height / 2 - (map.width * 150 / 340) / 2} ${map.width} ${map.width * 150 / 340}` : '0 0 340 150'
  const degrees = pose.yaw == null ? null : -pose.yaw * 180 / Math.PI
  return (
    <section className={`${cardClass} poi-rise overflow-hidden`} aria-label="Xem trước POI">
      <div className="relative h-37.5 bg-[#eef3f8]">
        {map && <svg viewBox={viewBox} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden="true">
          <image href={map.imageUrl} width={map.width} height={map.height} opacity={point ? 1 : 0.55} />
          {point && <g transform={`translate(${point.u} ${point.v})`}>
            <circle className="poi-marker-ring" r={16} fill="none" stroke="#2563eb" strokeWidth={3} />
            {degrees != null && <g transform={`rotate(${degrees})`}><path d="M0 0 L 80 -34 A 87 87 0 0 1 80 34 Z" fill="rgba(37,99,235,0.18)" /><path d="M0 0 L 60 0" stroke="#2563eb" strokeWidth={7} strokeLinecap="round" /></g>}
            <circle r={14} fill="#2563eb" stroke="#fff" strokeWidth={5} />
          </g>}
        </svg>}
        <span className={`absolute top-3 left-3 rounded-full border bg-white px-2.5 py-0.5 text-[11px] font-bold ${active ? 'border-[#bfe5d1] text-[#2f7a5b]' : 'border-[#f1dcb0] text-[#7d5310]'}`}>{active ? 'Khả dụng' : 'Không khả dụng'}</span>
      </div>
      <div className="px-4 pt-3.5 pb-4">
        <p className={`truncate text-[17px] font-bold tracking-[-0.02em] ${name.trim() ? 'text-[#0f172a]' : 'text-[#b6c6d3]'}`}>{name.trim() || 'Tên POI'}</p>
        <p className="mt-1 line-clamp-3 min-h-[1.5em] text-[12.5px] leading-5 text-[#54738a]">{description.trim() || 'Mô tả sẽ hiện ở đây.'}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5 font-mono text-[11px] text-[#173b59]">
          {map && <span className="rounded-md bg-[#f1f7fc] px-1.5 py-0.5">{map.mapKey}</span>}
          {inside && <span className="rounded-md bg-[#f1f7fc] px-1.5 py-0.5">({pose.x!.toFixed(2)}, {pose.y!.toFixed(2)})</span>}
          {pose.yaw != null && <span className="rounded-md bg-[#f1f7fc] px-1.5 py-0.5">{(pose.yaw * 180 / Math.PI).toFixed(0)}°</span>}
          {seconds.trim() && <span className="rounded-md bg-[#f1f7fc] px-1.5 py-0.5">{seconds.trim()} s</span>}
          {hasAudio && <span className="rounded-md bg-[#f1f7fc] px-1.5 py-0.5">audio</span>}
        </div>
      </div>
    </section>
  )
}

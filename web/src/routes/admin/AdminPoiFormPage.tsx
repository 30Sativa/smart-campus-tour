import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, FileText, Keyboard, MapPinned, Mic, RotateCcw, Save, TriangleAlert } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { AdminErrorPanel, AdminPage, Notice } from '../../features/administration/AdminUi'
import { poiRequestError } from '../../features/administration/pois/errors'
import { useCreatePoi, usePoi, useSetPoiActive, useUpdatePoi } from '../../features/administration/pois/hooks'
import type { CreatePoiInput, PoiDetails } from '../../features/administration/pois/types'
import { DEFAULT_POI_MAP, OCCUPANCY_MAPS, occupancyMapFor, type OccupancyMap } from '../../features/administration/pois/map/catalog'
import { PoiPosePicker, type PickerMode, type PickerPose } from '../../features/administration/pois/map/PoiPosePicker'
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

const STEPS = [
  { title: 'Thông tin', hint: 'Tên & mô tả' },
  { title: 'Vị trí & hướng', hint: 'Bản đồ hoặc nhập tay' },
  { title: 'Thuyết minh', hint: 'Không bắt buộc' },
  { title: 'Kiểm tra & tạo', hint: 'Xem lại lần cuối' },
]

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
  const [poseInputMethod, setPoseInputMethod] = useState<'map' | 'manual'>('map')
  const form = draft.form
  const selectedMap = occupancyMapFor(form.mapKey, form.mapFrame)
  const pickerPose: PickerPose = { x: numberValue(form.x), y: numberValue(form.y), yaw: numberValue(form.yaw) }

  const busy = create.isPending || update.isPending
  const editable = isCreate || poi.data?.usage.canEditContentAndAvailability === true
  const poseEditable = isCreate || poi.data?.usage.canEditPose === true
  const manualPose = poseInputMethod === 'manual' || !selectedMap
  const showPoseFields = manualPose || !poseEditable
  const pageTitle = isCreate ? 'Tạo POI' : 'Chi tiết POI'
  const picking = poseEditable && !manualPose && pickerMode !== 'pan'
  // Create walks the sections as steps; Edit shows the same sections as free tabs.
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0)
  const steps = isCreate ? STEPS : STEPS.slice(0, 3)
  const lastStep = steps.length - 1
  const topRef = useRef<HTMLDivElement>(null)
  const openStep = (next: number) => {
    setStep(next)
    setReached((value) => Math.max(value, next))
    requestAnimationFrame(() => topRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }
  /** Leaving a step forwards checks only the rules that belong to the steps before the target. */
  const goNext = (target = step + 1) => {
    const result = check()
    if ('error' in result && result.step < target) {
      setFormError(result.error)
      openStep(result.step)
      return
    }
    setFormError(null)
    openStep(target)
  }
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

  const selectPoseInputMethod = (method: 'map' | 'manual') => {
    if (!poseEditable || busy) return
    setPoseInputMethod(method)
    // Switching methods keeps the draft; only an unfinished pointer selection ends.
    setPickerMode(method === 'map' && (pickerPose.x == null || pickerPose.y == null) ? 'position' : 'pan')
    setFormError(null)
  }

  const selectMap = (mapKey: string) => {
    if (!poseEditable || busy) return
    const map = OCCUPANCY_MAPS.find((entry) => entry.mapKey === mapKey)
    if (!map) return
    setDraft((current) => ({ ...current, form: { ...current.form, mapKey: map.mapKey, mapFrame: map.frameId, x: '', y: '', yaw: '' } }))
    setPickerMode(poseInputMethod === 'manual' ? 'pan' : 'position')
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

  /**
   * Every rule the form enforces, in the order the user meets them. Each
   * failure names the step (0 info, 1 map & pose, 2 narration) that owns it,
   * so the wizard can send the user straight back there.
   */
  const check = (): { error: string; step: number } | { input: CreatePoiInput } => {
    if (!form.name.trim()) return { error: 'Nhập tên POI.', step: 0 }
    if (!form.mapKey.trim() || !form.mapFrame.trim()) return { error: 'Nhập MapKey và MapFrame.', step: 1 }
    const x = numberValue(form.x)
    const y = numberValue(form.y)
    const yaw = numberValue(form.yaw)
    if (x == null || y == null || yaw == null) return { error: 'Nhập x, y và yaw bằng số hợp lệ.', step: 1 }
    if (picking) return { error: 'Chốt vị trí và hướng, hoặc hủy thao tác chọn trên bản đồ trước khi lưu.', step: 1 }
    if (poseEditable && (Math.abs(x) > 999999.9999 || Math.abs(y) > 999999.9999)) return { error: 'x và y phải nằm trong giới hạn số của hệ thống.', step: 1 }
    if (poseEditable && (yaw < -3.141593 || yaw > 3.141593)) return { error: 'Yaw phải nằm trong khoảng −π đến π radian.', step: 1 }
    const poseChanged = isCreate || !poi.data || form.mapKey !== poi.data.mapKey || form.mapFrame !== poi.data.mapFrame ||
      x !== poi.data.x || y !== poi.data.y || yaw !== poi.data.yaw
    if (poseEditable && poseChanged) {
      if (Number(x.toFixed(4)) !== x || Number(y.toFixed(4)) !== y) return { error: 'X/Y chỉ nhận tối đa 4 chữ số thập phân.', step: 1 }
      if (Number(yaw.toFixed(6)) !== yaw) return { error: 'Yaw chỉ nhận tối đa 6 chữ số thập phân.', step: 1 }
      if (selectedMap && !cellAtPose(selectedMap, { x, y })) return { error: 'Pose nằm ngoài phạm vi bản đồ đã chọn.', step: 1 }
    }
    const seconds = form.narrationSeconds.trim() ? numberValue(form.narrationSeconds) : null
    if (form.narrationSeconds.trim() && (seconds == null || !Number.isInteger(seconds) || seconds <= 0)) return { error: 'Thời lượng narration phải là số giây nguyên lớn hơn 0.', step: 2 }
    return {
      input: {
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
      },
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    const result = check()
    if ('error' in result) {
      setFormError(result.error)
      openStep(result.step)
      return
    }
    const { input } = result

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
    { target: 0, label: 'Tên POI', done: !!form.name.trim(), note: form.name.trim() || 'Bắt buộc' },
    { target: 1, label: 'Vị trí trên bản đồ', done: hasPosition, note: hasPosition ? `${x!.toFixed(2)}, ${y!.toFixed(2)}` : 'Bắt buộc' },
    { target: 1, label: 'Hướng thân (yaw)', done: hasYaw, note: hasYaw ? `${(yaw! * 180 / Math.PI).toFixed(0)}°` : picking ? 'Đang chọn' : 'Bắt buộc' },
    { target: 2, label: 'Narration', done: words > 0, note: words ? `${words} từ` : 'Không bắt buộc', optional: true },
    { target: 2, label: 'Audio', done: !!form.audioUrl.trim(), note: form.audioUrl.trim() ? 'Đã gắn' : 'Không bắt buộc', optional: true },
  ]
  const missing = checks.filter((item) => !item.optional && !item.done)
  const submitHint = !editable
    ? 'POI đang bị khóa, không thể lưu.'
    : picking && step === 1
      ? 'Đang chọn trên bản đồ: chốt hướng thân hoặc bấm “Di chuyển bản đồ” để dừng chọn.'
      : missing.length
        ? `Còn thiếu: ${missing.map((item) => item.label).join(', ')}.`
        : isCreate ? 'POI mới được tạo ở trạng thái không khả dụng.' : 'Thay đổi được kiểm tra lại theo Route và Tour khi lưu.'

  // The map step gets the full width; the preview column comes back afterwards.
  const wide = step === 1
  // Enter in a single-line field moves a Create draft forward instead of submitting early.
  const keyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    const target = event.target as HTMLElement
    if (event.key !== 'Enter' || !isCreate || step >= lastStep || target.tagName !== 'INPUT') return
    event.preventDefault()
    goNext()
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Danh mục POI"
        title={isCreate ? 'Tạo POI' : poi.data!.name}
        description={isCreate ? 'Tạo định danh và nội dung ban đầu. POI mới luôn ở trạng thái không khả dụng.' : 'Cập nhật POI trên cùng mã định danh; thay đổi được kiểm tra lại theo Route và Tour.'}
        action={<Link to="/admin/pois" className={buttonClass('secondary')}><ArrowLeft size={16} aria-hidden="true" />Danh sách POI</Link>}
      />

      <div ref={topRef} className="mb-5 scroll-mt-24 space-y-3">
        <Notice tone="warn"><span className="font-semibold">Pose chưa được xác minh bằng robot thật.</span> Chọn trên bản đồ ROS chỉ lưu vị trí và hướng thân. Ô trống chưa chứng minh robot có thể tới POI.</Notice>
        {!isCreate && poi.data!.usage.hasReadyOrRunningTours && <Notice tone="danger">Tour READY/RUNNING đang dùng POI này. Mọi thao tác cập nhật và bật/tắt đều bị khóa.</Notice>}
        {!isCreate && !poi.data!.usage.canEditPose && !poi.data!.usage.hasReadyOrRunningTours && <Notice tone="info">Map và pose đã khóa vì POI được Route hoặc lịch sử tham chiếu; tên, mô tả và nội dung vẫn sửa được.</Notice>}
        {formError && <div className="poi-shake"><Notice tone="danger">{formError}</Notice></div>}
        {requestError && <Notice tone="danger" action={(update.isError || create.isError) && <button type="button" onClick={() => { void reload() }} className={buttonClass('secondary', 'sm')}><RotateCcw size={14} aria-hidden="true" />Tải lại</button>}>{requestError}</Notice>}
      </div>

      <StepNav steps={steps} step={step} reached={reached} mode={isCreate ? 'steps' : 'tabs'} done={[!!form.name.trim(), hasPosition && hasYaw, words > 0, false]} onSelect={(next) => (isCreate && next > step ? goNext(next) : openStep(next))} />

      <form
        noValidate onSubmit={submit} onKeyDown={keyDown} aria-label={pageTitle}
        className={`grid items-start gap-5 ${wide ? '' : 'xl:grid-cols-[minmax(0,1fr)_340px]'}`}
      >
        <div className="min-w-0 space-y-5">
          <FormSection id="poi-section-info" step={1} active={step === 0} done={!!form.name.trim()} title="Thông tin POI" description="Tên là nhãn hiển thị; hệ thống giữ ID bất biến." tag="Bắt buộc" delay={0}>
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

          <FormSection id="poi-section-pose" step={2} active={step === 1} done={hasPosition && hasYaw} title="Vị trí & hướng robot" description="Chọn trên bản đồ hoặc nhập tọa độ đã đo. Hai cách dùng chung một vị trí POI." tag="Bắt buộc" delay={60}>
            <Field label="Bản đồ" htmlFor="poi-map" hint={poseEditable ? 'Đổi bản đồ sẽ xóa pose trong bản nháp và yêu cầu chọn lại vị trí, hướng.' : undefined}>
              <select id="poi-map" disabled={!poseEditable || busy} value={selectedMap?.mapKey ?? '__stored__'} onChange={(event) => selectMap(event.target.value)} className={inputClass}>
                {!selectedMap && <option value="__stored__">{form.mapKey} / {form.mapFrame} (chưa có bản đồ tương ứng)</option>}
                {OCCUPANCY_MAPS.map((map) => <option key={map.mapKey} value={map.mapKey}>Map 2 ({map.mapKey}, frame {map.frameId})</option>)}
              </select>
            </Field>
            {poseEditable && <fieldset>
              <legend className={`${labelClass} mb-2`}>Cách đặt vị trí POI</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  { value: 'map', title: 'Chọn trên bản đồ', hint: 'Bấm vị trí, sau đó bấm hướng robot.', icon: MapPinned },
                  { value: 'manual', title: 'Nhập tọa độ thủ công', hint: 'Nhập X, Y và yaw từ số đã đo.', icon: Keyboard },
                ] as const).map(({ value, title, hint, icon: Icon }) => <label key={value} className={`flex items-start gap-3 rounded-xl border p-3.5 transition-colors ${manualPose === (value === 'manual') ? 'border-[#2d719e] bg-[#f1f7fc]' : 'border-[#e2e8f0] bg-white'} ${busy || (value === 'map' && !selectedMap) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-[#a8cde6]'}`}>
                  <input type="radio" name="poi-pose-method" value={value} checked={manualPose === (value === 'manual')} disabled={busy || (value === 'map' && !selectedMap)} onChange={() => selectPoseInputMethod(value)} aria-label={title} className="mt-1 size-4 shrink-0 accent-[#2d719e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b9dc9]" />
                  <Icon size={19} className="mt-0.5 shrink-0 text-[#54738a]" aria-hidden="true" />
                  <span><span className="block text-sm font-semibold text-[#173b59]">{title}</span><span className="mt-1 block text-xs leading-5 text-[#647b8d]">{hint}</span></span>
                </label>)}
              </div>
              <p className="mt-2 text-xs text-[#647b8d]">Chuyển cách nhập giữ nguyên tọa độ đang có. Chỉ đổi bản đồ mới xóa vị trí và hướng.</p>
            </fieldset>}
            {!selectedMap && <Notice tone="info">Chưa có ảnh cho đúng map/frame này. Hệ thống giữ nguyên tọa độ đã lưu và không hiển thị chúng trên bản đồ khác.</Notice>}
            <div className={`grid items-start gap-4 ${manualPose ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : 'xl:grid-cols-[minmax(0,1fr)_280px]'}`}>
            <div hidden={manualPose} className={manualPose ? 'hidden' : 'min-w-0'}>{selectedMap && <PoiPosePicker key={selectedMap.fingerprint} map={selectedMap} pose={pickerPose} editable={poseEditable && !busy && !manualPose} mode={pickerMode} onModeChange={setPickerMode} onPoseChange={changePose} />}</div>
            <div hidden={!showPoseFields} className={showPoseFields ? 'min-w-0 rounded-xl border border-[#e2e8f0] p-4' : 'hidden'}>
              <h3 className="text-sm font-semibold text-[#173b59]">{poseEditable ? 'Nhập vị trí & hướng' : 'Tọa độ đã lưu'}</h3>
              <p className="mt-1 mb-4 text-xs leading-5 text-[#647b8d]">X/Y tính bằng mét; yaw tính bằng radian (−π đến π). Nhập 0 cho yaw nếu robot hướng theo trục +X.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="MapKey" htmlFor="poi-map-key"><input id="poi-map-key" readOnly disabled={!poseEditable} value={form.mapKey} className={`${inputClass} bg-[#f8fafc] font-mono`} /></Field>
                <Field label="MapFrame" htmlFor="poi-map-frame"><input id="poi-map-frame" readOnly disabled={!poseEditable} value={form.mapFrame} className={`${inputClass} bg-[#f8fafc] font-mono`} /></Field>
                <Field label="X (m)" htmlFor="poi-x"><input id="poi-x" type="number" step="0.0001" required disabled={!poseEditable || busy} value={form.x} onChange={(event) => change('x', event.target.value)} className={`${inputClass} font-mono tabular-nums`} /></Field>
                <Field label="Y (m)" htmlFor="poi-y"><input id="poi-y" type="number" step="0.0001" required disabled={!poseEditable || busy} value={form.y} onChange={(event) => change('y', event.target.value)} className={`${inputClass} font-mono tabular-nums`} /></Field>
                <div className="sm:col-span-2"><Field label="Yaw (rad)" htmlFor="poi-yaw"><input id="poi-yaw" type="number" step="0.000001" min="-3.141593" max="3.141593" required disabled={!poseEditable || busy} value={form.yaw} onChange={(event) => change('yaw', event.target.value)} className={`${inputClass} font-mono tabular-nums`} /></Field></div>
              </div>
            </div>
            {manualPose ? <PoiPreview map={selectedMap} name={form.name} description={form.description} pose={pickerPose} seconds={form.narrationSeconds} hasAudio={!!form.audioUrl.trim()} active={!isCreate && poi.data!.isActive} /> : poseEditable && <section className="rounded-xl bg-[#f1f7fc] p-4" aria-label="Tọa độ đã chọn">
              <h3 className="text-sm font-semibold text-[#173b59]">Tọa độ đã chọn</h3>
              <dl className="mt-3 space-y-2 text-sm">
                {([['X (m)', x?.toFixed(4)], ['Y (m)', y?.toFixed(4)], ['Yaw (rad)', yaw?.toFixed(6)]]).map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-[#647b8d]">{label}</dt><dd className="font-mono tabular-nums text-[#173b59]">{value ?? 'Chưa chọn'}</dd></div>)}
              </dl>
              <p className="mt-4 text-xs leading-5 text-[#647b8d]">Muốn nhập hoặc tinh chỉnh số chính xác? Chuyển sang nhập tọa độ thủ công.</p>
              <button type="button" disabled={busy} onClick={() => selectPoseInputMethod('manual')} className={`${buttonClass('secondary', 'sm')} mt-3`}>Nhập / chỉnh tọa độ</button>
            </section>}
            </div>
            {!poseEditable && <p className="rounded-xl bg-[#f4f8fb] px-3 py-2 text-xs text-[#647b8d]">Pose bị khóa theo lịch sử sử dụng, không chỉ theo trạng thái IsActive.</p>}
          </FormSection>

          <FormSection id="poi-section-content" step={3} active={step === 2} done={words > 0} title="Narration và nội dung" description="Các trường này không bắt buộc khi tạo POI; upload audio được để cho bước riêng." tag="Không bắt buộc" delay={120}>
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

          {isCreate && <FormSection id="poi-section-review" step={4} active={step === 3} done={false} title="Kiểm tra & tạo" description="Xem lại trước khi tạo. POI mới luôn ở trạng thái không khả dụng." tag="Bước cuối" delay={0}>
            <ReviewRow icon={FileText} title="Thông tin POI" missing={!form.name.trim()} onEdit={() => openStep(0)} rows={[['Tên', form.name.trim() || 'Chưa nhập'], ['Mô tả', form.description.trim() || '—']]} />
            <ReviewRow icon={MapPinned} title="Vị trí & hướng thân" missing={!(hasPosition && hasYaw)} onEdit={() => openStep(1)} rows={[
              ['Bản đồ', `${form.mapKey} · frame ${form.mapFrame}`],
              ['X, Y', x != null && y != null ? `${x.toFixed(4)} m, ${y.toFixed(4)} m` : 'Chưa chọn'],
              ['Yaw', yaw != null ? `${yaw.toFixed(6)} rad (${(yaw * 180 / Math.PI).toFixed(1)}°)` : 'Chưa chọn'],
            ]} />
            <ReviewRow icon={Mic} title="Thuyết minh" optional={!words} onEdit={() => openStep(2)} rows={words || form.audioUrl.trim() || form.fallbackVideoUrl.trim() ? [
              ['Lời thuyết minh', words ? `${words} từ · ${form.narrationSeconds.trim() ? `${form.narrationSeconds.trim()} giây` : 'chưa nhập thời lượng'}` : '—'],
              ['Audio', form.audioUrl.trim() || '—'],
              ['Video dự phòng', form.fallbackVideoUrl.trim() || '—'],
            ] : [['', 'Chưa có. Có thể bổ sung sau khi tạo POI.']]} />
          </FormSection>}

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#d9e9f5] bg-white/95 px-3 py-3 shadow-[0_-10px_30px_-24px_#285c7d] backdrop-blur-md">
            {isCreate
              ? <button type="button" onClick={() => openStep(step - 1)} className={`${buttonClass('secondary')} ${step === 0 ? 'invisible' : ''}`}><ArrowLeft size={15} aria-hidden="true" />Quay lại</button>
              : <Link to="/admin/pois" className={buttonClass('secondary')}>Hủy</Link>}
            <p id="poi-submit-hint" className="hidden min-w-0 flex-1 px-2 text-center text-xs leading-5 text-[#7c94a7] md:block">{isCreate ? `Bước ${step + 1} / ${steps.length} · ` : ''}{submitHint}</p>
            <div className="flex flex-wrap gap-2">
              {isCreate && step === 2 && !words && <button type="button" onClick={() => goNext(lastStep)} className={buttonClass('ghost')}>Bỏ qua bước này</button>}
              {isCreate && step < lastStep && <button type="button" onClick={() => goNext()} className={buttonClass('primary')}>Tiếp tục<ArrowRight size={15} aria-hidden="true" /></button>}
              {(!isCreate || step === lastStep) && <button type="submit" disabled={busy || !editable || picking} aria-describedby="poi-submit-hint" className={buttonClass('primary')}><Save size={16} aria-hidden="true" />{create.isPending ? 'Đang tạo…' : update.isPending ? 'Đang lưu…' : isCreate ? 'Tạo POI không khả dụng' : 'Lưu thay đổi'}</button>}
            </div>
          </div>
        </div>

        <aside className={`space-y-4 xl:sticky xl:top-20 ${wide ? 'hidden' : ''}`} aria-label="Xem trước và kiểm tra">
          <PoiPreview map={selectedMap} name={form.name} description={form.description} pose={pickerPose} seconds={form.narrationSeconds} hasAudio={!!form.audioUrl.trim()} active={!isCreate && poi.data!.isActive} />

          <section className={`${cardClass} poi-rise p-4`} style={{ animationDelay: '120ms' }} aria-labelledby="poi-ready-heading">
            <ReadinessRing done={checks.filter((item) => !item.optional && item.done).length} total={checks.filter((item) => !item.optional).length} />
            <ul className="my-3 space-y-0.5">
              {checks.map((item) => (
                <li key={item.label}>
                  <a href={`#poi-section-${['info', 'pose', 'content'][item.target]}`} onClick={(event) => { event.preventDefault(); if (isCreate && item.target > step) goNext(item.target); else openStep(item.target) }} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-[#173b59] transition-colors hover:bg-[#f1f7fc]">
                    <span className={`grid size-5.5 place-items-center rounded-full border-[1.5px] transition-all duration-300 ${item.done ? 'border-[#2f7a5b] bg-[#2f7a5b] text-white' : 'border-[#cbdbe8] text-transparent'}`} aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
                    <span>{item.label}<span className="sr-only">{item.done ? ': đã xong' : item.optional ? ': không bắt buộc' : ': chưa xong'}</span></span>
                    <span className={`max-w-28 truncate text-[11px] font-semibold ${item.optional && !item.done ? 'text-[#a3b4c2]' : 'text-[#86a0b3]'}`} aria-hidden="true">{item.note}</span>
                  </a>
                </li>
              ))}
            </ul>
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

type ReadinessItem = { target: number; label: string; done: boolean; note: string; optional?: boolean }

function FormSection({ id, step, active, done, title, description, tag, delay, children }: { id: string; step: number; active: boolean; done: boolean; title: string; description: string; tag: string; delay: number; children: ReactNode }) {
  const headingId = `${id}-heading`
  return (
    <section id={id} aria-labelledby={headingId} className={`${cardClass} poi-step-in scroll-mt-24 ${active ? '' : 'hidden'}`} style={{ animationDelay: `${delay}ms` }}>
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

/**
 * The step bar. Create walks it in order (later steps unlock once the earlier
 * ones pass); Detail uses the same sections as free tabs.
 */
function StepNav({ steps, step, reached, mode, done, onSelect }: { steps: typeof STEPS; step: number; reached: number; mode: 'steps' | 'tabs'; done: boolean[]; onSelect: (step: number) => void }) {
  return (
    <nav aria-label={mode === 'steps' ? 'Các bước tạo POI' : 'Các phần của POI'} className="mb-5 rounded-[20px] border border-[#d9e9f5] bg-white px-3 py-3 shadow-[0_12px_32px_-30px_#285c7d] sm:px-4">
      <ol className="flex items-center">
        {steps.map((item, index) => {
          const current = index === step
          const complete = done[index] && !current && (mode === 'tabs' || index <= reached)
          const locked = mode === 'steps' && index > reached + 1
          return (
            <li key={item.title} className="flex min-w-0 flex-1 items-center last:flex-none">
              <button
                type="button" disabled={locked} onClick={() => onSelect(index)}
                aria-label={item.title}
                aria-current={current ? 'step' : undefined}
                className="flex min-w-0 items-center gap-2.5 rounded-xl p-1 text-left transition-colors hover:bg-[#f1f7fc] disabled:cursor-not-allowed disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]"
              >
                <span className={`grid size-8.5 shrink-0 place-items-center rounded-full border-2 font-mono text-[13px] font-bold transition-all duration-300 ${
                  current ? 'border-[#2d719e] bg-white text-[#2d719e] shadow-[0_0_0_5px_rgba(45,113,158,0.14)]'
                    : complete ? 'border-[#2d719e] bg-[#2d719e] text-white'
                      : 'border-[#cbdbe8] bg-white text-[#86a0b3]'}`}>
                  {complete ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : index + 1}
                </span>
                <span className="hidden min-w-0 md:block">
                  <span className={`block truncate text-[13px] font-bold ${current || complete ? 'text-[#173b59]' : 'text-[#54738a]'}`}>{item.title}</span>
                  <span className="block truncate text-[11px] text-[#86a0b3]">{item.hint}</span>
                </span>
              </button>
              {index < steps.length - 1 && <span aria-hidden="true" className="mx-2 h-0.5 min-w-3 flex-1 overflow-hidden rounded-full bg-[#cbdbe8] sm:mx-3"><span className={`block h-full origin-left bg-[#2d719e] transition-transform duration-500 ${index < step ? 'scale-x-100' : 'scale-x-0'}`} /></span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function ReviewRow({ icon: Icon, title, rows, missing = false, optional = false, onEdit }: { icon: typeof FileText; title: string; rows: Array<[string, string]>; missing?: boolean; optional?: boolean; onEdit: () => void }) {
  return (
    <div className={`grid grid-cols-[34px_minmax(0,1fr)_auto] items-start gap-3 rounded-2xl border p-3.5 ${missing ? 'border-[#f5c8c2] bg-[#fff4f2]' : 'border-[#e2e8f0]'}`}>
      <span className={`grid size-8.5 place-items-center rounded-[11px] ${missing ? 'bg-white text-[#dc2626]' : optional ? 'bg-[#f1f7fc] text-[#86a0b3]' : 'bg-[#e5f3ff] text-[#2d78a9]'}`}><Icon size={16} aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className="text-[13.5px] leading-[34px] font-bold text-[#173b59]">{title}</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
          {rows.map(([label, value]) => <div key={label + value} className="contents"><dt className="text-[#86a0b3]">{label}</dt><dd className="font-semibold break-words text-[#173b59]">{value}</dd></div>)}
        </dl>
      </div>
      <button type="button" onClick={onEdit} className={buttonClass('ghost', 'sm')}>Sửa</button>
    </div>
  )
}

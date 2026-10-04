import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, Check, RotateCcw, Save, TriangleAlert } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { AdminErrorPanel, AdminPage, Notice } from '../../features/administration/AdminUi'
import { poiRequestError } from '../../features/administration/pois/errors'
import { useCreatePoi, usePoi, useSetPoiActive, useUpdatePoi } from '../../features/administration/pois/hooks'
import type { CreatePoiInput, PoiDetails } from '../../features/administration/pois/types'
import { ConfirmationDialog } from '../../features/staff/components/ConfirmationDialog'
import { inputClass, labelClass, buttonClass } from '../../features/staff/ui-classes'
import { PageHeader, LoadingPanel } from '../../features/staff/StaffUi'

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
  name: '', description: '', mapKey: '', mapFrame: '', x: '', y: '', yaw: '',
  narrationText: '', audioUrl: '', narrationSeconds: '', fallbackVideoUrl: '',
}

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
  const form = draft.form

  const busy = create.isPending || update.isPending
  const editable = isCreate || poi.data?.usage.canEditContentAndAvailability === true
  const poseEditable = isCreate || poi.data?.usage.canEditPose === true
  const pageTitle = isCreate ? 'Tạo POI' : 'Chi tiết POI'
  const change = (field: keyof PoiForm, value: string) => {
    setDraft((current) => ({
      form: { ...current.form, [field]: value },
      rowVersion: current.rowVersion,
    }))
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
    if (poseEditable && (Math.abs(x) > 999999.9999 || Math.abs(y) > 999999.9999)) return setFormError('x và y phải nằm trong giới hạn số của hệ thống.')
    if (poseEditable && (yaw < -3.141593 || yaw > 3.141593)) return setFormError('Yaw phải nằm trong khoảng −π đến π radian.')
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

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Danh mục POI"
        title={isCreate ? 'Tạo POI' : poi.data!.name}
        description={isCreate ? 'Tạo định danh và nội dung ban đầu. POI mới luôn ở trạng thái không khả dụng.' : 'Cập nhật POI trên cùng mã định danh; thay đổi được kiểm tra lại theo Route và Tour.'}
        action={<Link to="/admin/pois" className={buttonClass('secondary')}><ArrowLeft size={16} aria-hidden="true" />Danh sách POI</Link>}
      />

      <div className="mb-4 space-y-3">
        <Notice tone="warn"><span className="font-semibold">Pose chưa được xác minh bằng robot thật.</span> Nhập map/frame/x/y/yaw trực tiếp chỉ lưu cấu hình vào DB. Map picker chưa bật vì chưa có transform pixel↔ROS được hiệu chuẩn.</Notice>
        {!isCreate && poi.data!.usage.hasReadyOrRunningTours && <Notice tone="danger">Tour READY/RUNNING đang dùng POI này. Mọi thao tác cập nhật và bật/tắt đều bị khóa.</Notice>}
        {!isCreate && !poi.data!.usage.canEditPose && !poi.data!.usage.hasReadyOrRunningTours && <Notice tone="info">Map và pose đã khóa vì POI được Route hoặc lịch sử tham chiếu; tên, mô tả và nội dung vẫn sửa được.</Notice>}
        {formError && <Notice tone="danger">{formError}</Notice>}
        {requestError && <Notice tone="danger" action={(update.isError || create.isError) && <button type="button" onClick={() => { void reload() }} className={buttonClass('secondary', 'sm')}><RotateCcw size={14} aria-hidden="true" />Tải lại</button>}>{requestError}</Notice>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <form onSubmit={submit} className="space-y-5 rounded-[18px] border border-[#d9e9f5] bg-white p-5 shadow-[0_12px_32px_-30px_#285c7d]" aria-label={pageTitle}>
          <section className="space-y-4" aria-labelledby="poi-basic-heading">
            <div><h2 id="poi-basic-heading" className="font-bold text-[#173b59]">Thông tin POI</h2><p className="mt-1 text-xs text-[#7c94a7]">Tên là nhãn hiển thị; hệ thống giữ ID bất biến.</p></div>
            <Field label="Tên POI" htmlFor="poi-name"><input id="poi-name" maxLength={150} required disabled={!editable} value={form.name} onChange={(event) => change('name', event.target.value)} className={inputClass} /></Field>
            <Field label="Mô tả" htmlFor="poi-description"><textarea id="poi-description" maxLength={2000} rows={3} disabled={!editable} value={form.description} onChange={(event) => change('description', event.target.value)} className={inputClass} /></Field>
          </section>

          <section className="space-y-4 border-t border-[#eef3f7] pt-5" aria-labelledby="poi-pose-heading">
            <div><h2 id="poi-pose-heading" className="font-bold text-[#173b59]">Map và pose</h2><p className="mt-1 text-xs text-[#7c94a7]">X/Y tính bằng mét; yaw bằng radian trong khoảng −π đến π.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="MapKey" htmlFor="poi-map-key"><input id="poi-map-key" maxLength={100} required disabled={!poseEditable} value={form.mapKey} onChange={(event) => change('mapKey', event.target.value)} className={inputClass} /></Field>
              <Field label="MapFrame" htmlFor="poi-map-frame"><input id="poi-map-frame" maxLength={100} required disabled={!poseEditable} value={form.mapFrame} onChange={(event) => change('mapFrame', event.target.value)} className={inputClass} /></Field>
              <Field label="X (m)" htmlFor="poi-x"><input id="poi-x" type="number" step="0.0001" required disabled={!poseEditable} value={form.x} onChange={(event) => change('x', event.target.value)} className={`${inputClass} font-mono tabular-nums`} /></Field>
              <Field label="Y (m)" htmlFor="poi-y"><input id="poi-y" type="number" step="0.0001" required disabled={!poseEditable} value={form.y} onChange={(event) => change('y', event.target.value)} className={`${inputClass} font-mono tabular-nums`} /></Field>
              <Field label="Yaw (rad)" htmlFor="poi-yaw"><input id="poi-yaw" type="number" step="0.000001" min="-3.141593" max="3.141593" required disabled={!poseEditable} value={form.yaw} onChange={(event) => change('yaw', event.target.value)} className={`${inputClass} font-mono tabular-nums`} /></Field>
            </div>
            {!poseEditable && <p className="rounded-xl bg-[#f4f8fb] px-3 py-2 text-xs text-[#647b8d]">Pose bị khóa theo lịch sử sử dụng, không chỉ theo trạng thái IsActive.</p>}
          </section>

          <section className="space-y-4 border-t border-[#eef3f7] pt-5" aria-labelledby="poi-content-heading">
            <div><h2 id="poi-content-heading" className="font-bold text-[#173b59]">Narration và nội dung</h2><p className="mt-1 text-xs text-[#7c94a7]">Các trường này không bắt buộc khi tạo POI; upload audio được để cho bước riêng.</p></div>
            <Field label="Narration text" htmlFor="poi-narration"><textarea id="poi-narration" rows={4} disabled={!editable} value={form.narrationText} onChange={(event) => change('narrationText', event.target.value)} className={inputClass} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Audio URL / asset key" htmlFor="poi-audio-url"><input id="poi-audio-url" maxLength={1000} disabled={!editable} value={form.audioUrl} onChange={(event) => change('audioUrl', event.target.value)} className={inputClass} /></Field>
              <Field label="Thời lượng narration (giây)" htmlFor="poi-narration-seconds"><input id="poi-narration-seconds" type="number" step="1" min="1" disabled={!editable} value={form.narrationSeconds} onChange={(event) => change('narrationSeconds', event.target.value)} className={inputClass} /></Field>
            </div>
            <Field label="Fallback video URL" htmlFor="poi-fallback-video"><input id="poi-fallback-video" maxLength={1000} disabled={!editable} value={form.fallbackVideoUrl} onChange={(event) => change('fallbackVideoUrl', event.target.value)} className={inputClass} /></Field>
          </section>

          <div className="flex flex-wrap justify-end gap-2 border-t border-[#eef3f7] pt-4">
            <Link to="/admin/pois" className={buttonClass('secondary')}>Hủy</Link>
            <button type="submit" disabled={busy || !editable} className={buttonClass('primary')}><Save size={15} aria-hidden="true" />{create.isPending ? 'Đang tạo…' : update.isPending ? 'Đang lưu…' : isCreate ? 'Tạo POI không khả dụng' : 'Lưu thay đổi'}</button>
          </div>
        </form>

        <aside className="space-y-4">
          {!isCreate && <section className="rounded-[18px] border border-[#d9e9f5] bg-white p-5 shadow-[0_12px_32px_-30px_#285c7d]">
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
          <section className="rounded-[18px] border border-[#d9e9f5] bg-[#f7fbfe] p-5">
            <h2 className="font-bold text-[#173b59]">POI không đồng nghĩa Route-ready</h2>
            <p className="mt-2 text-sm leading-6 text-[#647b8d]">Route và RouteStop do kỹ thuật chuẩn bị. Một POI có thể tồn tại khi chưa có narration hoặc chưa được kiểm tra đường đi; không dùng IsActive làm bằng chứng robot có thể tới điểm.</p>
          </section>
        </aside>
      </div>

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

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <div><label htmlFor={htmlFor} className={labelClass}>{label}</label><div className="mt-1.5">{children}</div></div>
}

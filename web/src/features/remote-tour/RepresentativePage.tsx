import { isRepresentativeRole } from '../../auth/roles'
import { useAuthStore } from '../../stores/auth-store'
import { useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import type { Registration, RemoteTour, RosterRow } from '../../api/contracts/remote-tour'
import { remotePreviewApi } from '../../mocks/remote-tour-mock'
import { useRemoteMutation, useRemoteWorkspace } from './remote-hooks'
import { Badge, buttonClass, Confirmation, Field, inputClass, MutationError, Panel, RemotePage } from './RemoteUi'
import { ErrorPanel, LoadingPanel } from '../staff/StaffUi'
import { readRoster } from './roster'


export function Invitation({ registration }: { registration: Registration }) {
  const [copied, setCopied] = useState('')
  const link = `${window.location.origin}/join/${registration.tourId}`
  return <div className="mt-3 grid gap-3 rounded-xl bg-[#f1f6fe] p-4 text-sm"><p>Link tham gia: <Link className="break-all underline" to={`/join/${registration.tourId}`}>{link}</Link></p><p className="break-all">Mã đoàn: <strong>{registration.code}</strong></p><button className={buttonClass} onClick={async () => { try { await navigator.clipboard.writeText(`${link}\nMã đoàn: ${registration.code}`); setCopied('Đã sao chép thông tin tham gia.') } catch { setCopied('Không sao chép được. Hãy chọn link và mã bên trên để sao chép.') } }}>Sao chép lời mời</button><p role="status">{copied}</p></div>
}

function RegistrationEditor({ tour, registration, onClose }: { tour: RemoteTour; registration?: Registration; onClose: () => void }) {
  const [school, setSchool] = useState(registration?.school ?? '')
  const [contact, setContact] = useState(registration?.contact ?? '')
  const [email, setEmail] = useState(registration?.email ?? '')
  const [roster, setRoster] = useState<RosterRow[]>(registration?.roster ?? [])
  const [fileError, setFileError] = useState<unknown>()
  const [reading, setReading] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const readVersion = useRef(0)
  const save = useRemoteMutation(() => remotePreviewApi.saveRegistration({ tourId: tour.id, school, contact, email, roster }, registration?.revision))
  const editable = tour.state === 'SCHEDULED'
  return <Panel title={registration ? 'Chỉnh sửa đăng ký' : 'Đăng ký đoàn'}><form className="grid gap-4" onSubmit={e => { e.preventDefault(); setConfirm(true) }}>
    <Field label="Tên trường / đoàn"><input className={inputClass} required value={school} onChange={e => setSchool(e.target.value)} disabled={!editable} /></Field>
    <Field label="Người liên hệ"><input className={inputClass} required value={contact} onChange={e => setContact(e.target.value)} disabled={!editable} /></Field>
    <Field label="Email đại diện"><input className={inputClass} type="email" required value={email} onChange={e => setEmail(e.target.value)} disabled={!editable || registration?.state === 'APPROVED'} /></Field>
    {registration?.state === 'APPROVED' && <p className="text-sm">Thay roster sẽ cần duyệt lại. Đổi email sau duyệt cần liên hệ Admin.</p>}
    <a href="/templates/roster.xlsx" download className="text-sm font-semibold underline">Tải mẫu Excel</a>
    <Field label="Danh sách học sinh (.xlsx)"><input className={inputClass} type="file" accept=".xlsx" disabled={!editable || save.isPending} onChange={async e => {
      const file = e.target.files?.[0]; const version = ++readVersion.current
      if (!file) return
      setReading(true); setFileError(undefined)
      try { const rows = await readRoster(file); if (version === readVersion.current) setRoster(rows) } catch (error) { if (version === readVersion.current) setFileError(error) } finally { if (version === readVersion.current) setReading(false) }
    }} /></Field>
    <p className="text-sm">HoTen bắt buộc, Lop tùy chọn. File hợp lệ sẽ thay toàn bộ roster sau khi xác nhận. Chỉ dùng dữ liệu giả khi thử bản xem trước.</p>
    <MutationError error={fileError} />
    <div className="max-h-52 overflow-auto rounded-xl border border-[#dce9fb]"><table className="w-full text-left text-sm"><caption className="p-2 text-left">Preview: {roster.length} học sinh</caption><thead><tr><th className="p-2">Họ tên</th><th className="p-2">Lớp</th></tr></thead><tbody>{roster.map((r, i) => <tr key={i}><td className="p-2">{r.name}</td><td className="p-2">{r.className || 'Không có lớp'}</td></tr>)}</tbody></table></div>
    {!editable && <p role="status">Buổi đã khóa đăng ký. Bạn vẫn có thể xem thông tin đăng ký của mình.</p>}
    <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={!editable || reading || Boolean(fileError) || !roster.length || save.isPending}>{reading ? 'Đang đọc Excel…' : 'Kiểm tra và gửi'}</button><button type="button" className={buttonClass} onClick={onClose}>Đóng form</button></div>
  </form><Confirmation title="Xác nhận danh sách gửi duyệt" open={confirm} pending={save.isPending} error={save.error} onClose={() => setConfirm(false)} onConfirm={() => save.mutate(undefined, { onSuccess: onClose })}><p>Gửi {roster.length} học sinh cho {tour.name}. Danh sách này thay toàn bộ roster cũ và cần Admin duyệt.</p></Confirmation></Panel>
}

export default function RepresentativePage() {
  const canRegister = isRepresentativeRole(useAuthStore(s => s.user?.role))
  const workspace = useRemoteWorkspace(); const [params] = useSearchParams()
  const { pathname } = useLocation()
  const mine = pathname.endsWith('/bookings') || params.get('view') === 'mine'
  const [editing, setEditing] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<Registration | null>(null)
  const cancel = useRemoteMutation((r: Registration) => remotePreviewApi.registrationAction(r.id, r.revision, 'cancel'))
  if (!canRegister) return <RemotePage title="Đăng ký đoàn" description="Chức năng dành cho đại diện trường/đoàn."><p>Hãy sử dụng tài khoản đại diện để quản lý đăng ký của mình.</p></RemotePage>
  if (workspace.isPending) return <LoadingPanel />
  if (!workspace.data) return <ErrorPanel error={workspace.error} onRetry={workspace.refetch} />
  const { tours, registrations, routes } = workspace.data
  const shown = mine ? tours.filter(t => registrations.some(r => r.tourId === t.id)) : tours.filter(t => t.state === 'SCHEDULED')
  return <RemotePage title="Đăng ký tham quan cho đoàn" description="Chọn buổi có sẵn, gửi danh sách học sinh và theo dõi kết quả duyệt."><nav className="vs-tabs" aria-label="Đăng ký đoàn"><Link className="vs-tab" aria-current={!mine ? 'page' : undefined} to="/visit/book">Buổi có thể đăng ký</Link><Link className="vs-tab" aria-current={mine ? 'page' : undefined} to="/visit/bookings">Đăng ký của tôi</Link></nav>
    {!shown.length && <Panel title="Chưa có buổi nào"><p>{mine ? 'Bạn chưa gửi đăng ký đoàn.' : 'Hiện không có buổi đang nhận đăng ký.'}</p></Panel>}
    <div className="grid gap-5 lg:grid-cols-2">{shown.map(t => {
      const r = registrations.find(r => r.tourId === t.id)
      return <Panel key={t.id} title={t.name}><div className="space-y-3"><Badge value={t.state} /><p>{new Date(t.scheduledAt).toLocaleString('vi-VN')}</p><p>{routes.find(route => route.id === t.routeId)?.pois.map(p => p.name).join(' → ')}</p>
        {r && <><Badge value={r.state} /><p>{r.school} · {r.roster.length} học sinh</p>{r.state === 'REJECTED' && <p role="status">Lý do từ chối: {r.rejectionReason}. Hãy sửa và gửi lại khi buổi còn nhận đăng ký.</p>}{r.state === 'APPROVED' && ['SCHEDULED', 'READY', 'RUNNING'].includes(t.state) && <Invitation registration={r} />}</>}
        {t.state === 'SCHEDULED' ? <div className="flex flex-wrap gap-3"><button className={buttonClass} onClick={() => setEditing(t.id)}>{!r ? 'Đăng ký đoàn' : r.state === 'CANCELLED' ? 'Đăng ký lại' : 'Sửa / gửi lại danh sách'}</button>{r && r.state !== 'CANCELLED' && <button className={buttonClass} onClick={() => setCancelling(r)}>Hủy đăng ký</button>}</div> : <p className="text-sm">Chỉ xem thông tin. Buổi đã khóa sửa, upload và hủy đăng ký.</p>}
      </div></Panel>
    })}</div>
    {editing && tours.some(t => t.id === editing) && <RegistrationEditor key={editing} tour={tours.find(t => t.id === editing)!} registration={registrations.find(r => r.tourId === editing)} onClose={() => setEditing(null)} />}
    <Confirmation title="Hủy đăng ký đoàn" open={Boolean(cancelling)} pending={cancel.isPending} error={cancel.error} onClose={() => setCancelling(null)} onConfirm={() => cancelling && cancel.mutate(cancelling, { onSuccess: () => setCancelling(null) })}><p>Quyền tham gia của đoàn sẽ bị thu hồi. Bạn có thể đăng ký lại nếu buổi còn nhận đăng ký.</p></Confirmation>
  </RemotePage>
}

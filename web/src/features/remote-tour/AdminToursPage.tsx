import { useState } from 'react'
import type { Registration, RemoteTour, Workspace } from '../../api/contracts/remote-tour'
import { remotePreviewApi } from '../../mocks/remote-tour-mock'
import { useRemoteMutation, useRemoteWorkspace } from './remote-hooks'
import { Badge, buttonClass, Confirmation, Field, inputClass, MutationError, Panel, RemotePage } from './RemoteUi'
import { ErrorPanel, LoadingPanel } from '../staff/StaffUi'
import { Invitation } from './RepresentativePage'
import { TourActions } from './TourActions'

function TourForm({ tour, workspace, onClose }: { tour?: RemoteTour; workspace: Workspace; onClose: () => void }) {
  const [name, setName] = useState(tour?.name ?? '')
  const [scheduledAt, setTime] = useState(tour?.scheduledAt ?? '')
  const [description, setDescription] = useState(tour?.description ?? '')
  const [routeId, setRoute] = useState(tour?.routeId ?? workspace.routes[0]?.id ?? '')
  const save = useRemoteMutation(() => remotePreviewApi.saveTour({ id: tour?.id, revision: tour?.revision, name, scheduledAt, description, routeId }))
  return <Panel title={tour ? 'Sửa buổi tham quan' : 'Tạo buổi tham quan'}><form className="grid gap-4" onSubmit={e => { e.preventDefault(); save.mutate(undefined, { onSuccess: onClose }) }}><Field label="Tên buổi"><input required className={inputClass} value={name} onChange={e => setName(e.target.value)} /></Field><Field label="Giờ dự kiến"><input required type="datetime-local" className={inputClass} value={scheduledAt} onChange={e => setTime(e.target.value)} /></Field><Field label="Mô tả"><textarea className={inputClass} value={description} onChange={e => setDescription(e.target.value)} /></Field><Field label="Tuyến đã chuẩn bị"><select className={inputClass} value={routeId} onChange={e => setRoute(e.target.value)}>{workspace.routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field><p>{workspace.routes.find(r => r.id === routeId)?.pois.map(p => p.name).join(' → ')}</p><p className="text-sm">POI, audio và góc quay do nhóm nội dung/kỹ thuật chuẩn bị. Thiếu cấu hình cần được bổ sung trước khi chốt buổi.</p><MutationError error={save.error} /><div className="flex gap-3"><button className={buttonClass} disabled={save.isPending}>Lưu buổi</button><button type="button" className={buttonClass} onClick={onClose}>Đóng form</button></div></form></Panel>
}
function RegistrationReview({ registration: r, tour }: { registration: Registration; tour: RemoteTour }) {
  const [rejecting, setRejecting] = useState(false); const [reason, setReason] = useState('')
  const mutation = useRemoteMutation((action: 'approve' | 'reject' | 'invite') => remotePreviewApi.registrationAction(r.id, r.revision, action, reason))
  return <article className="grid gap-3 rounded-xl border border-[#dce9fb] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{r.school}</h3><Badge value={r.state} /></div><p>{r.contact} · {r.email}</p><details><summary className="cursor-pointer font-semibold">Xem roster ({r.roster.length} học sinh)</summary><ul className="mt-2 max-h-48 overflow-auto text-sm">{r.roster.map((row, i) => <li key={i}>{row.name} · {row.className || 'Không có lớp'}</li>)}</ul></details>
    {r.rejectionReason && <p>Lý do từ chối: {r.rejectionReason}</p>}
    {tour.state === 'SCHEDULED' && r.state === 'SUBMITTED' && <div className="flex gap-3"><button className={buttonClass} disabled={mutation.isPending} onClick={() => mutation.mutate('approve')}>Duyệt đoàn</button><button className={buttonClass} onClick={() => setRejecting(true)}>Từ chối</button></div>}
    {r.state === 'APPROVED' && ['SCHEDULED', 'READY'].includes(tour.state) && <><Invitation registration={r} /><button className={buttonClass} disabled={mutation.isPending} onClick={() => mutation.mutate('invite')}>{r.invitationSentAt ? 'Mô phỏng gửi lại email' : 'Mô phỏng gửi email'}</button>{r.invitationSentAt && <p role="status" className="text-sm">Lần mô phỏng gần nhất: {new Date(r.invitationSentAt).toLocaleString('vi-VN')}. Không gửi email thật.</p>}</>}
    <MutationError error={mutation.error} /><Confirmation title="Từ chối đăng ký" open={rejecting} pending={mutation.isPending} error={mutation.error} onClose={() => setRejecting(false)} onConfirm={() => mutation.mutate('reject', { onSuccess: () => setRejecting(false) })}><Field label="Lý do gửi cho đại diện"><textarea required className={inputClass} value={reason} onChange={e => setReason(e.target.value)} /></Field></Confirmation>
  </article>
}
export default function AdminToursPage() {
  const query = useRemoteWorkspace(); const [selected, setSelected] = useState(''); const [form, setForm] = useState<'new' | 'edit' | null>(null)
  if (query.isPending) return <LoadingPanel />
  if (!query.data) return <ErrorPanel error={query.error} onRetry={query.refetch} />
  const workspace = query.data; const tour = workspace.tours.find(t => t.id === selected) ?? workspace.tours[0]
  return <RemotePage title="Quản lý buổi tham quan" description="Chuẩn bị tuyến, duyệt đoàn và chốt nội dung trước khi Staff bắt đầu."><button className={buttonClass} onClick={() => setForm('new')}>Tạo buổi</button><div className="grid items-start gap-5 xl:grid-cols-[320px_1fr]"><Panel title="Danh sách buổi"><div className="grid gap-3">{workspace.tours.map(t => <button key={t.id} className={`${buttonClass} flex-col items-start gap-2 text-left`} aria-pressed={tour?.id === t.id} onClick={() => { setSelected(t.id); setForm(null) }}><span>{t.name}</span><Badge value={t.state} /></button>)}</div></Panel><div className="space-y-5">{form && <TourForm key={`${form}-${tour?.id}`} tour={form === 'edit' ? tour : undefined} workspace={workspace} onClose={() => setForm(null)} />}{tour && <><Panel title={tour.name}><div className="space-y-3"><Badge value={tour.state} /><p>{new Date(tour.scheduledAt).toLocaleString('vi-VN')} · {tour.description}</p><p>{workspace.routes.find(r => r.id === tour.routeId)?.pois.map(p => p.name).join(' → ')}</p>{tour.state === 'SCHEDULED' && <button className={buttonClass} onClick={() => setForm('edit')}>Sửa thông tin</button>}<TourActions tour={tour} options={workspace.actions[tour.id]} /><p className="text-sm">READY chốt nội dung và roster. Email đã gửi hoặc robot online không phải điều kiện READY.</p></div></Panel><Panel title="Đăng ký đoàn"><div className="grid gap-4">{workspace.registrations.filter(r => r.tourId === tour.id).map(r => <RegistrationReview key={r.id} registration={r} tour={tour} />)}{!workspace.registrations.some(r => r.tourId === tour.id) && <p>Chưa có đoàn đăng ký.</p>}</div></Panel><Panel title="Lịch sử buổi"><ul className="space-y-2 text-sm">{tour.log.map((line, i) => <li key={i}>{line}</li>)}</ul></Panel></>}</div></div></RemotePage>
}

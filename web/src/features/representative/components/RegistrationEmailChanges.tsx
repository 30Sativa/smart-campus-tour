import { useState, type FormEvent } from 'react'
import type { RepresentativeRegistration, RepresentativeRosterRow, RosterEmailChangeInput } from '../api/types'
import { useRepEmailChanges, useRequestRepEmailChange } from '../representative-hooks'
import { formatDateTime, readRepError } from '../rep-format'
import { repButton } from '../rep-classes'
import { Callout, EmptyState, ErrorState, InfoList, Panel } from './RepUi'
import { canRequestRowEmail } from '../row-permissions'

function EmailChangeForm({ registration, row, refresh }: { registration: RepresentativeRegistration; row: RepresentativeRosterRow; refresh: () => Promise<void> }) {
  // The displayed draft keeps its own version snapshot; polling never rebases an attempt.
  const [snapshot] = useState({ expectedTourRowVersion: registration.tourRowVersion, expectedRegistrationRowVersion: registration.rowVersion, expectedRowVersion: row.rowVersion! })
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [attempt, setAttempt] = useState<RosterEmailChangeInput | null>(null)
  const [done, setDone] = useState(false)
  const mutation = useRequestRepEmailChange()
  const failure = mutation.error ? readRepError(mutation.error) : null
  const conflict = failure?.status === 409
  const forbidden = failure?.status === 403 || failure?.status === 404
  const uncertain = Boolean(attempt && failure && (!failure.status || failure.status >= 500))
  const allowed = canRequestRowEmail(registration, row)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (done || conflict || forbidden || mutation.isPending || (!uncertain && (!allowed || !consent))) return
    const proposedEmail = email.trim().toLowerCase()
    if (!attempt && proposedEmail === row.email.trim().toLowerCase()) return
    const input = attempt ?? { ...snapshot, requestId: crypto.randomUUID(), proposedEmail }
    setAttempt(input)
    try {
      await mutation.mutateAsync({ id: registration.summary.id, rowId: row.id!, input }); setDone(true)
    } catch (error) {
      const status = readRepError(error).status
      // A definitive rejection may be corrected as a new intent; uncertain results keep the frozen payload.
      if (status && status >= 400 && status < 500 && ![403, 404, 409].includes(status)) setAttempt(null)
    }
  }
  return <form className="rep-stack" onSubmit={event => void submit(event)}>
    <InfoList items={[{ label: 'Người nhận', value: row.displayName }, { label: 'Email hiện tại', value: row.email }]} />
    <p className="rep-hint">Email hiện tại tiếp tục có hiệu lực trong khi chờ duyệt hoặc nếu yêu cầu bị từ chối. Chỉ sau khi Staff chấp thuận, email mới được áp dụng.</p>
    <label className="rep-field"><span>Email đề xuất</span><input className="rep-input" type="email" required maxLength={254} autoComplete="email" value={email} disabled={Boolean(attempt) || done} onChange={event => setEmail(event.target.value)} /></label>
    {!attempt && email.trim().toLowerCase() === row.email.trim().toLowerCase() && <p className="rep-hint">Email đề xuất phải khác email hiện tại.</p>}
    <label className="rep-consent"><input type="checkbox" checked={consent} disabled={Boolean(attempt) || done} onChange={event => setConsent(event.target.checked)} /><span>Tôi xác nhận có quyền cung cấp thông tin đăng ký và email lời mời trong danh sách này.</span></label>
    {done && <Callout tone="ok" title="Đã gửi yêu cầu, chờ Staff duyệt" role="status">Email hiện tại chưa thay đổi.</Callout>}
    {failure && <Callout tone="danger" title={uncertain ? 'Chưa xác nhận được kết quả gửi' : failure.message} role="alert">
      {uncertain ? 'Thử lại giữ nguyên mã yêu cầu, email đề xuất và phiên bản của lần gửi trước.' : conflict ? 'Tải lại dữ liệu và bắt đầu lại trước khi gửi yêu cầu mới.' : null}
      {Object.entries(failure.fieldErrors).map(([field, text]) => <p key={field}>{text}</p>)}
    </Callout>}
    {!allowed && !attempt && <Callout tone="muted" title="Dòng này hiện không cho phép yêu cầu đổi email">Tải lại để kiểm tra quyền và trạng thái mới nhất.</Callout>}
    <div className="rep-inline-actions">
      {!done && <button type="submit" className={repButton('primary')} disabled={mutation.isPending || conflict || forbidden || (!uncertain && (!allowed || !consent || !email.trim() || email.trim().toLowerCase() === row.email.trim().toLowerCase()))}>{mutation.isPending ? 'Đang gửi…' : uncertain ? 'Thử lại cùng yêu cầu' : 'Gửi yêu cầu duyệt'}</button>}
      {(conflict || forbidden || (attempt && !uncertain && !done)) && <button type="button" className={repButton('secondary')} disabled={mutation.isPending} onClick={() => void refresh()}>Tải lại dữ liệu và bắt đầu lại</button>}
    </div>
  </form>
}

export function RegistrationEmailChanges({ registration, selectedRow, selectRow, refresh }: { registration: RepresentativeRegistration; selectedRow: string | null; selectRow: (id: string) => void; refresh: () => Promise<void> }) {
  const query = useRepEmailChanges(registration.summary.id)
  const [draftRevision, setDraftRevision] = useState(0)
  const accepted = registration.roster.filter(row => row.participationState === 'ACCEPTED' && row.id)
  const row = accepted.find(item => item.id === selectedRow) ?? accepted[0]
  const pending = query.data?.some(item => item.rowId === row?.id && item.state === 'PENDING')
  async function reload() { await refresh(); await query.refetch(); setDraftRevision(value => value + 1) }
  return <div className="rep-stack">
    <Panel title="Yêu cầu đổi email">
      {query.isPending ? <p aria-busy="true">Đang tải yêu cầu đổi email…</p> : query.error ? <ErrorState title="Không tải được yêu cầu đổi email" message={readRepError(query.error).message} onRetry={() => void query.refetch()} /> : !row ? <EmptyState title="Chưa có dòng được chấp nhận" description="Yêu cầu đổi email chỉ áp dụng cho dòng được Staff chấp nhận." /> : <div className="rep-stack">
        <label className="rep-field"><span>Dòng cần đổi email</span><select className="rep-input" value={row.id} onChange={event => selectRow(event.target.value)}>{accepted.map(item => <option key={item.id} value={item.id}>{item.displayName}, {item.email}</option>)}</select></label>
        {pending ? <Callout tone="warn" title="Đã có yêu cầu chờ Staff duyệt">Email hiện tại: {row.email}. Không thể tạo thêm yêu cầu đang chờ cho cùng dòng.</Callout> : <EmailChangeForm key={`${row.id}:${draftRevision}`} registration={registration} row={row} refresh={reload} />}
      </div>}
    </Panel>
    {query.data && !query.error && <Panel title="Lịch sử yêu cầu">
      {!query.data.length ? <p className="rep-hint">Chưa có yêu cầu đổi email.</p> : <div className="rep-history">{query.data.map(item => <article key={item.id} className="rep-list-row">
        <h3>Dòng {item.rowNumber}: {item.currentEmail}</h3><p>Email đề xuất: {item.proposedEmail}</p>
        <p className={`rep-badge rep-badge--${item.state === 'PENDING' ? 'warning' : item.state === 'ACCEPTED' ? 'success' : 'danger'}`}>{item.state === 'PENDING' ? 'Chờ Staff duyệt' : item.state === 'ACCEPTED' ? 'Đã chấp thuận' : item.state === 'EXPIRED' ? 'Đã hết hạn' : 'Bị từ chối'}</p>
        <p className="rep-hint">Yêu cầu lúc {formatDateTime(item.createdAt)}</p>{item.reviewedAt && <p className="rep-hint">Xét duyệt lúc {formatDateTime(item.reviewedAt)}</p>}{item.reviewReason && <p>Lý do: {item.reviewReason}</p>}
      </article>)}</div>}
    </Panel>}
  </div>
}

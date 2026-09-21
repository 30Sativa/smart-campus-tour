import { studentStatus } from './remote-status'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { StudentSnapshot } from '../../api/contracts/remote-tour'
import { remotePreviewApi } from '../../mocks/remote-tour-mock'
import { useRemoteMutation, useStudentSnapshot } from './remote-hooks'
import { buttonClass, Field, inputClass, MutationError, Panel, RemotePage } from './RemoteUi'
import { LoadingPanel } from '../staff/StaffUi'

function JoinForm({ tourId }: { tourId: string }) {
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [className, setClassName] = useState('')
  const join = useRemoteMutation(() => remotePreviewApi.join(tourId, code, name, className))
  return <Panel title="Đối chiếu danh sách"><form className="grid max-w-xl gap-4" onSubmit={e => { e.preventDefault(); join.mutate(undefined) }}><Field label="Mã đoàn"><input className={inputClass} required value={code} onChange={e => setCode(e.target.value)} /></Field><Field label="Họ tên"><input className={inputClass} required autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></Field><Field label="Lớp (nếu danh sách đoàn có lớp)"><input className={inputClass} value={className} onChange={e => setClassName(e.target.value)} /></Field><p className="text-sm">Nhập thông tin theo hướng dẫn của đại diện. Không cần tài khoản hoặc OTP.</p><MutationError error={join.error} /><button className={buttonClass} disabled={join.isPending}>Vào buổi tham quan</button></form></Panel>
}

function LiveView({ snapshot: s }: { snapshot: StudentSnapshot }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [question, setQuestion] = useState(''); const [answer, setAnswer] = useState<{ text: string; poi: string } | null>(null)
  const [error, setError] = useState<unknown>(); const [pending, setPending] = useState(false)
  const mounted = useRef(true)
  const poi = s.route?.pois[s.tour.poiIndex]
  const canNarrate = s.tour.operation === 'NORMAL' && s.tour.step === 'OBSERVING'
  useEffect(() => {
    mounted.current = true
    const audio = audioRef.current
    return () => { mounted.current = false; audio?.pause() }
  }, [])
  useEffect(() => { audioRef.current?.pause() }, [s.visitKey, canNarrate])
  async function ask() {
    setPending(true); setError(undefined); setAnswer(null)
    try {
      const reply = await remotePreviewApi.ask(s.tour.id, s.tour.poiIndex, question)
      const current = await remotePreviewApi.student(s.tour.id)
      if (mounted.current && current.access === 'live') setAnswer(reply)
    } catch (err) { if (mounted.current) setError(err) } finally { if (mounted.current) setPending(false) }
  }
  return <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]"><div className="space-y-5"><Panel title="Góc nhìn chung"><div className="grid aspect-video place-content-center rounded-xl bg-[#1f314d] p-6 text-center text-white">{s.videoUrl ? <video src={s.videoUrl} controls autoPlay playsInline aria-label="Video tham quan" /> : <><p className="text-xl font-semibold">Chưa có nguồn video</p><p className="mt-2 text-sm text-blue-100">Bạn đang xem thử bố cục và trạng thái buổi tham quan.</p></>}</div></Panel><Panel title="Bản đồ 2D mẫu"><svg role="img" aria-label="Sơ đồ tuyến mẫu và vị trí robot mô phỏng" viewBox="0 0 100 90" className="max-h-72 w-full rounded-xl bg-[#f1f6fe]"><polyline points={s.route?.pois.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#8baee3" strokeWidth="1" />{s.route?.pois.map(p => <g key={p.name}><circle cx={p.x} cy={p.y} r="3" fill="#5b91ed" /><text x={p.x} y={p.y + 8} textAnchor="middle" fontSize="3.2" fill="#1f314d">{p.name}</text></g>)}{s.pose && <path d={`M ${s.pose.x} ${s.pose.y - 5} l -3 8 l 3 -2 l 3 2 Z`} fill="#1f314d" />}</svg><p className="mt-2 text-xs">Pose mô phỏng · chưa phải bản đồ được căn với robot thật.</p></Panel></div><div className="space-y-5"><Panel title={poi?.name ?? 'Về điểm kết thúc'}><p className="mb-4 text-sm leading-6">{poi?.text ?? 'Robot đang về điểm kết thúc. Buổi chỉ hoàn thành sau khi có xác nhận dừng.'}</p>{s.narrationUrl && canNarrate ? <audio ref={audioRef} src={s.narrationUrl} controls className="w-full" /> : <p className="text-sm">{canNarrate ? 'Audio chưa được kết nối. Bạn có thể đọc giới thiệu phía trên.' : 'Thuyết minh đang dừng.'}</p>}</Panel><Panel title="Hỏi đáp riêng"><form className="grid gap-3" onSubmit={e => { e.preventDefault(); void ask() }}><Field label="Câu hỏi về điểm tham quan"><textarea className={inputClass} required value={question} onChange={e => setQuestion(e.target.value)} /></Field><button className={buttonClass} disabled={pending || !poi}>{pending ? 'Đang trả lời…' : 'Gửi câu hỏi mẫu'}</button><button type="button" className={buttonClass} disabled title="Chưa kết nối dịch vụ STT/TTS">Hỏi bằng giọng nói · chưa khả dụng</button><p className="text-xs">AI và giọng nói thật chưa kết nối. Câu trả lời mẫu chỉ hiển thị trong browser này.</p><MutationError error={error} />{answer && <div role="status" className="rounded-xl bg-[#eaf4ff] p-3 text-sm"><strong>{answer.poi}</strong><p>{answer.text}</p></div>}</form></Panel></div></div>
}

export default function StudentPage() {
  const { tourId = '' } = useParams(); const snapshot = useStudentSnapshot(tourId)
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) } }, [])
  if (!tourId) return <RemotePage title="Tham quan campus từ xa" description="Mở link do đại diện trường/đoàn chia sẻ để vào đúng buổi."><Panel title="Bạn đã có lời mời?"><p>Dùng link trong lời mời. Học sinh không cần đăng nhập.</p><Link className={`${buttonClass} mt-4`} to="/join/tour-3">Xem buổi mẫu</Link><p className="mt-3 text-sm">Chỉ để thử giao diện: mã DEMO-3 · Nguyễn Văn An · 12A1.</p></Panel><Link className={buttonClass} to="/visit">Tôi là đại diện trường/đoàn</Link></RemotePage>
  if (snapshot.isPending) return <LoadingPanel label="Đang kiểm tra buổi tham quan…" />
  if (!snapshot.data) return <RemotePage title="Không mở được buổi tham quan" description="Kiểm tra lại link với đại diện."><button className={buttonClass} onClick={() => snapshot.refetch()}>Thử lại</button></RemotePage>
  const s = snapshot.data
  const disconnected = !online || snapshot.isError || snapshot.fetchStatus === 'paused'
  return <RemotePage title={s.tour.name} description={new Date(s.tour.scheduledAt).toLocaleString('vi-VN')}><p role="status" className="rounded-xl bg-[#eaf4ff] p-4 font-semibold">{disconnected ? 'Mất kết nối trạng thái · Đang chờ cập nhật lại' : studentStatus(s)}</p>
    {disconnected ? <Panel title="Đang kết nối lại"><p>Nội dung và thuyết minh đã dừng cho tới khi lấy được trạng thái mới.</p><button className={`${buttonClass} mt-3`} onClick={() => snapshot.refetch()}>Thử kết nối lại</button></Panel> : <>
      {['join', 'denied'].includes(s.access) && <>{s.message && <p role="alert">{s.message}</p>}<JoinForm tourId={tourId} /></>}
      {['waiting', 'updating'].includes(s.access) && <Panel title="Phòng chờ"><p>{s.access === 'updating' ? 'Danh sách đang được cập nhật. Giữ màn hình này; quyền tham gia sẽ được kiểm tra lại sau khi duyệt.' : 'Buổi chưa bắt đầu. Bạn sẽ tự vào live khi Staff bắt đầu và quyền tham gia còn hợp lệ.'}</p><p className="mt-3 text-sm">Chuẩn bị tai nghe và cho phép âm thanh trên trình duyệt. Live và AI chưa mở trong phòng chờ.</p></Panel>}
      {s.access === 'live' && <LiveView snapshot={s} />}
      {s.access === 'ended' && <Panel title="Cảm ơn bạn đã tham gia"><p>{s.tour.state === 'COMPLETED' ? 'Hành trình đã hoàn thành.' : 'Buổi đã kết thúc theo quyết định của người tổ chức.'} Video, thuyết minh và hỏi đáp đã đóng.</p></Panel>}
    </>}</RemotePage>
}

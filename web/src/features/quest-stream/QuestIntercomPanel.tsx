import { useState } from 'react'
import { QUEST_AUDIO_CONFIGURED, QUEST_AUDIO_PATH, STAFF_AUDIO_PATH } from './quest-audio-config'
import { useQuestIntercom } from './use-quest-intercom'
import { buttonClass } from '../../components/ui/ui-classes'

const STATE = { idle: 'Chưa kết nối', connecting: 'Đang kết nối microphone…', waiting: 'Chờ đầu bên kia kết nối', connected: 'Đã kết nối âm thanh', error: 'Kết nối bị gián đoạn' }

export function QuestIntercomPanel({ side }: { side: 'quest' | 'staff' }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const call = useQuestIntercom(side === 'quest' ? QUEST_AUDIO_PATH : STAFF_AUDIO_PATH,
    side === 'quest' ? STAFF_AUDIO_PATH : QUEST_AUDIO_PATH)
  const active = ['connecting', 'waiting', 'connected'].includes(call.state)
  return <section aria-label="Đàm thoại Quest" className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 space-y-4">
    <h2 className="text-xl font-semibold">{side === 'quest' ? 'Mic và loa của kính' : 'Đàm thoại với Quest trên robot'}</h2>
    <p>{side === 'quest' ? 'Giữ trang này mở trên kính. Mic kính gửi âm thanh tới Staff; loa kính phát tiếng Staff.' : 'Mic của máy Staff gửi tiếng tới loa kính; bạn nghe người gần robot qua mic kính.'}</p>
    <p className="text-sm text-slate-600">Thử nghiệm một kính. Mic ban đầu tắt; chỉ bật khi sẵn sàng nói. Không ghi âm cuộc đàm thoại.</p>
    {!QUEST_AUDIO_CONFIGURED ? <p role="status">Chưa cấu hình hai luồng âm thanh HTTPS. Xem hướng dẫn thiết lập đàm thoại Quest.</p> : <>
      {!active && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void call.start(username.trim(), password) }}>
        <label className="block">Tài khoản âm thanh<input className="mt-1 block w-full rounded border p-2" value={username} onChange={event => setUsername(event.target.value)} autoComplete="off" required /></label>
        <label className="block">Mật khẩu âm thanh<input className="mt-1 block w-full rounded border p-2" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="off" required /></label>
        <button className={buttonClass('primary')} disabled={!username.trim() || username.includes(':') || !password}>Kết nối mic/loa</button>
      </form>}
      <p role="status" aria-live="polite">{STATE[call.state]}</p>
      {call.error && <p role="alert" className="text-red-700">{call.error}</p>}
      {active && <div className="flex flex-wrap gap-3">
        <button className={buttonClass('primary')} disabled={call.state === 'connecting'} aria-pressed={!call.muted} onClick={call.toggleMic}>{call.muted ? 'Bật mic' : 'Tắt mic'}</button>
        <button className={buttonClass('secondary')} onClick={() => void call.playSpeaker()}>Bật loa</button>
        <button className={buttonClass('secondary')} onClick={() => { call.stop(); setPassword('') }}>Ngắt kết nối</button>
      </div>}
      {call.speakerBlocked && <p role="status">Trình duyệt chưa cho phát tiếng. Bấm “Bật loa”.</p>}
    </>}
    <audio ref={call.audio} autoPlay controls aria-label="Âm thanh từ đầu bên kia" className="w-full" />
  </section>
}

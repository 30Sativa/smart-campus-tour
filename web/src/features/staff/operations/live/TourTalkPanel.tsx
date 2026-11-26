import { Mic, Radio, Send, UserRound, Users } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { buttonClass, inputClass } from '../../../../components/ui/ui-classes'
import { formatTime } from '../../../../components/ui/date-time'
import { TalkAudioButton } from '../../../tour-talk/TalkAudioButton'
import { usePushToTalk, type PushToTalk } from '../../../tour-talk/guide-voice'
import { TALK_MAX_TEXT, talkErrorText, type TalkMessage } from '../../../tour-talk/talk-types'
import { loadStaffTalkAudio, useSendStaffTalk, useStaffTalkFeed } from './tour-talk'

/** Things an Operator often says at a stop; a press sends it as text. */
const PROMPTS = ['Các bạn muốn đi điểm nào tiếp theo?', 'Các bạn có câu hỏi gì về điểm này không?', 'Các bạn nghe rõ không?']

/**
 * ADR-0070: the Operator talks to every Viewer of the Tour and reads their text replies, which no other Viewer sees.
 * Voice is live push-to-talk (ADR-0072): held, Viewers hear it at once; text messages stay. Other Staff follow the
 * conversation read-only.
 */
export function TourTalkPanel({ tourId, operatorName }: { tourId: string; operatorName?: string | null }) {
  const feed = useStaffTalkFeed(tourId, true)
  const send = useSendStaffTalk(tourId)
  const [text, setText] = useState('')
  const list = useRef<HTMLOListElement>(null)
  const data = feed.data
  const messages = data?.messages ?? []
  const canSend = Boolean(data?.canSend)
  const voice = usePushToTalk(tourId, canSend)
  const lastSeq = messages.at(-1)?.seq ?? 0

  useEffect(() => {
    list.current?.scrollTo?.({ top: list.current.scrollHeight })
  }, [lastSeq])

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    const value = text.trim()
    if (!value || send.isPending) return
    send.mutate({ text: value }, { onSuccess: () => setText('') })
  }

  return (
    <div className="space-y-3 p-4">
      <ol ref={list} aria-label="Tin nhắn" aria-live="polite" className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {feed.isPending && <li className="text-xs text-muted">Đang tải…</li>}
        {!feed.isPending && messages.length === 0 && <li className="rounded-lg bg-[#f8fafc] px-3 py-2.5 text-[13px] leading-5 text-[#475569]">
          {canSend ? 'Chưa có tin nào. Hãy chào đoàn, hỏi các bạn muốn đi đâu tiếp hoặc kể thêm về điểm đang đứng.'
            : data?.open === false ? 'Kênh trò chuyện mở từ 15 phút trước giờ bắt đầu và đóng khi Tour kết thúc.' : 'Chưa có tin nào.'}
        </li>}
        {messages.map(message => <TalkRow key={message.id} message={message} tourId={tourId} />)}
      </ol>

      {feed.isError && <p role="alert" className="text-xs font-semibold text-[#9d3428]">Không tải được trò chuyện. Đang thử lại…</p>}

      {!canSend ? <p className="flex gap-2 text-[13px] leading-5 text-[#475569]">
        <UserRound size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        {data?.open === false ? 'Kênh trò chuyện đang đóng.' : `Chỉ ${operatorName ?? 'người vận hành được giao'} mới nói chuyện với người xem được.`}
      </p> : <>
        <div className="flex flex-wrap gap-1.5" aria-label="Câu nói nhanh">
          {PROMPTS.map(prompt => <button key={prompt} type="button" disabled={send.isPending}
            className="rounded-full border border-[#d9e9f5] bg-white px-2.5 py-1 text-xs font-medium text-[#35507a] hover:border-[#a8cde6] disabled:opacity-60"
            onClick={() => send.mutate({ text: prompt })}>{prompt}</button>)}
        </div>

        <PushToTalkButton voice={voice} />

        <form className="flex items-center gap-2" onSubmit={submit}>
          <input className={inputClass} value={text} maxLength={TALK_MAX_TEXT} onChange={event => setText(event.target.value)}
            placeholder="Nhắn cho cả đoàn…" aria-label="Tin nhắn cho người xem" disabled={send.isPending} />
          <button type="submit" className={buttonClass('primary', 'sm')} disabled={!text.trim() || send.isPending} aria-label="Gửi tin nhắn">
            <Send size={14} aria-hidden="true" />
          </button>
        </form>

        {send.isError && <p role="alert" className="text-xs font-semibold text-[#9d3428]">{talkErrorText(send.error)}</p>}
        <p className="text-xs leading-5 text-muted">Giọng nói và tin nhắn của bạn tới mọi người xem. Câu trả lời của từng người xem chỉ Staff thấy.</p>
      </>}
    </div>
  )
}

/** A tap shorter than this latches the microphone on until the next tap; a longer press talks only while held. */
const LATCH_TAP_MS = 350

const VOICE_NOTE: Partial<Record<PushToTalk['state'], string>> = {
  denied: 'Trình duyệt chưa cho dùng micro. Cho phép micro cho trang này rồi nhấn lại, hoặc gõ tin nhắn.',
  unavailable: 'Máy chủ phát hình chưa bật kênh nói trực tiếp. Hãy gõ tin nhắn.',
  error: 'Mất kết nối giọng nói. Nhấn lại để kết nối lại.',
  unsupported: 'Trình duyệt này không hỗ trợ nói trực tiếp; bạn gõ tin nhắn nhé.',
}

/**
 * ADR-0072 push-to-talk: hold (mouse, touch, Space or Enter) to speak; a quick tap keeps the microphone on until the
 * next tap. The first press asks for the microphone and connects, so Viewers start hearing after a moment.
 */
function PushToTalkButton({ voice }: { voice: PushToTalk }) {
  const pressedAt = useRef(0)
  const [latched, setLatched] = useState(false)
  const down = () => {
    if (latched) {
      setLatched(false)
      voice.release()
      // On air, a tap switches the microphone off; after a lost connection it reconnects at once.
      if (voice.state !== 'error' && voice.state !== 'denied') return
    }
    pressedAt.current = Date.now()
    voice.press()
  }
  const up = () => {
    if (!pressedAt.current) return
    const quick = Date.now() - pressedAt.current < LATCH_TAP_MS
    pressedAt.current = 0
    if (quick) setLatched(true)
    else voice.release()
  }
  const cancel = () => { if (pressedAt.current) { pressedAt.current = 0; setLatched(false); voice.release() } }
  const keyDown = (event: KeyboardEvent) => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); down() }
  }
  const keyUp = (event: KeyboardEvent) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); up() } }

  const onAir = voice.talking && voice.state === 'ready'
  const connecting = voice.talking && voice.state === 'connecting'
  const label = onAir ? (latched ? 'Đang nói với người xem. Nhấn để tắt micro' : 'Đang nói với người xem…')
    : connecting ? 'Đang mở micro…' : 'Nhấn giữ để nói'
  const note = VOICE_NOTE[voice.state]
  return <div className="space-y-1.5">
    <button type="button" aria-pressed={voice.talking} disabled={voice.state === 'unsupported'}
      className={`flex w-full touch-none select-none items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-colors disabled:opacity-60 ${
        onAir ? 'bg-[#dc2626] text-white shadow-[0_0_0_4px_rgba(220,38,38,0.18)]'
          : connecting ? 'bg-[#fff4f2] text-[#9d3428] ring-1 ring-[#f5c8c2]'
            : 'bg-[#0f4c81] text-white hover:bg-[#0c3f6b]'}`}
      onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture?.(event.pointerId); down() }}
      onPointerUp={up} onPointerCancel={cancel} onKeyDown={keyDown} onKeyUp={keyUp} onBlur={cancel}
      onContextMenu={event => event.preventDefault()}>
      {onAir ? <Radio size={16} className="animate-pulse motion-reduce:animate-none" aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
      {label}
    </button>
    <p role="status" className="text-center text-xs leading-5 text-muted">
      {onAir ? 'Người xem đang nghe trực tiếp giọng của bạn.'
        : voice.state === 'ready' ? 'Micro đã sẵn sàng. Giữ nút để nói, nhấn nhanh để bật/tắt.'
          : 'Giữ nút khi nói, thả ra khi xong. Lần đầu trình duyệt sẽ hỏi quyền dùng micro.'}
    </p>
    {note && <p role="alert" className="text-xs font-semibold text-[#9d3428]">{note}</p>}
  </div>
}

function TalkRow({ message, tourId }: { message: TalkMessage; tourId: string }) {
  const staff = message.from === 'STAFF'
  const shared = message.viewerRowType === 'SHARED_VIEWING'
  return (
    <li className={`flex ${staff ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-5 ${staff ? 'bg-[#eaf2fe] text-[#0f172a]' : 'border border-[#e6edf4] bg-white text-[#0f172a]'}`}>
        <p className="mb-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] font-semibold text-[#64748b]">
          {staff ? <span>{message.staffName ?? 'Người vận hành'}</span> : <>
            {shared ? <Users size={12} aria-hidden="true" /> : <UserRound size={12} aria-hidden="true" />}
            <span>{message.viewerName ?? 'Người xem'}</span>
            {message.viewerClass && <span className="font-normal">· {message.viewerClass}</span>}
            {shared && <span className="font-normal">· Màn hình chung</span>}
          </>}
          <span className="font-normal tabular-nums">· {formatTime(message.sentAt)}</span>
        </p>
        {message.hasAudio && <TalkAudioButton load={() => loadStaffTalkAudio(tourId, message.id)} durationMs={message.audioDurationMs}
          available={message.audioAvailable}
          className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#1d4ed8] ring-1 ring-[#bfd5f7] data-[state=gone]:bg-transparent data-[state=gone]:font-normal data-[state=gone]:text-muted data-[state=gone]:ring-0" />}
        {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}
      </div>
    </li>
  )
}

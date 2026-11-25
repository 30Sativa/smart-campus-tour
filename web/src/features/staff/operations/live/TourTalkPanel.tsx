import { Mic, Send, Square, UserRound, Users, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { buttonClass, inputClass } from '../../../../components/ui/ui-classes'
import { formatTime } from '../../../../components/ui/date-time'
import { TalkAudioButton } from '../../../tour-talk/TalkAudioButton'
import { clipLength, TALK_MAX_AUDIO_MS, TALK_MAX_TEXT, talkErrorText, type TalkMessage } from '../../../tour-talk/talk-types'
import { useVoiceRecorder } from '../../../tour-talk/use-voice-recorder'
import { loadStaffTalkAudio, useSendStaffTalk, useStaffTalkFeed } from './tour-talk'

/** Things an Operator often says at a stop; a press sends it as text. */
const PROMPTS = ['Các bạn muốn đi điểm nào tiếp theo?', 'Các bạn có câu hỏi gì về điểm này không?', 'Các bạn nghe rõ không?']

/**
 * ADR-0070: the Operator talks to every Viewer of the Tour (a voice clip or text) and reads their text replies,
 * which no other Viewer sees. Other Staff follow the conversation read-only.
 */
export function TourTalkPanel({ tourId, operatorName }: { tourId: string; operatorName?: string | null }) {
  const feed = useStaffTalkFeed(tourId, true)
  const send = useSendStaffTalk(tourId)
  const [text, setText] = useState('')
  const recorder = useVoiceRecorder(clip => send.mutate({ clip }))
  const list = useRef<HTMLOListElement>(null)
  const data = feed.data
  const messages = data?.messages ?? []
  const canSend = Boolean(data?.canSend)
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

  const recording = recorder.state === 'recording'
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
          {PROMPTS.map(prompt => <button key={prompt} type="button" disabled={send.isPending || recording}
            className="rounded-full border border-[#d9e9f5] bg-white px-2.5 py-1 text-xs font-medium text-[#35507a] hover:border-[#a8cde6] disabled:opacity-60"
            onClick={() => send.mutate({ text: prompt })}>{prompt}</button>)}
        </div>

        {recording ? <div className="flex items-center gap-2 rounded-xl border border-[#f5c8c2] bg-[#fff4f2] px-3 py-2" role="status">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#dc2626] motion-reduce:animate-none" aria-hidden="true" />
          <span className="flex-1 text-[13px] font-semibold text-[#9d3428] tabular-nums">
            Đang ghi âm {clipLength(recorder.elapsedMs)} / {clipLength(TALK_MAX_AUDIO_MS)}
          </span>
          <button type="button" className={buttonClass('ghost', 'sm')} onClick={recorder.cancel}><X size={14} aria-hidden="true" />Hủy</button>
          <button type="button" className={buttonClass('primary', 'sm')} onClick={recorder.stop}><Square size={13} aria-hidden="true" />Dừng và gửi</button>
        </div> : <form className="flex items-center gap-2" onSubmit={submit}>
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void recorder.start()}
            disabled={send.isPending || recorder.state === 'starting' || recorder.state === 'unsupported'}
            aria-label="Ghi âm và gửi giọng nói cho người xem" title="Nói với người xem (tối đa 30 giây)">
            <Mic size={15} aria-hidden="true" />Nói
          </button>
          <input className={inputClass} value={text} maxLength={TALK_MAX_TEXT} onChange={event => setText(event.target.value)}
            placeholder="Nhắn cho cả đoàn…" aria-label="Tin nhắn cho người xem" disabled={send.isPending} />
          <button type="submit" className={buttonClass('primary', 'sm')} disabled={!text.trim() || send.isPending} aria-label="Gửi tin nhắn">
            <Send size={14} aria-hidden="true" />
          </button>
        </form>}

        {recorder.state === 'denied' && <p role="alert" className="text-xs font-semibold text-[#9d3428]">Trình duyệt chưa cho dùng micro. Cho phép micro rồi thử lại, hoặc gõ tin nhắn.</p>}
        {recorder.state === 'unsupported' && <p className="text-xs text-muted">Trình duyệt này không ghi âm được; bạn gõ tin nhắn nhé.</p>}
        {send.isError && <p role="alert" className="text-xs font-semibold text-[#9d3428]">{talkErrorText(send.error)}</p>}
        <p className="text-xs leading-5 text-muted">Tin của bạn gửi tới mọi người xem. Câu trả lời của từng người xem chỉ Staff thấy.</p>
      </>}
    </div>
  )
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

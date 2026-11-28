import { AlertCircle, Headset, Send, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { TalkAudioButton } from '../../tour-talk/TalkAudioButton'
import { TALK_MAX_TEXT, talkErrorText } from '../../tour-talk/talk-types'
import { loadStudentTalkAudio, type StudentTalk } from '../talk/student-talk'
import '../student-talk.css'

/** Quick answers to what a guide usually asks. */
const QUICK = ['Dạ, em nghe rõ ạ', 'Em muốn hỏi thêm về điểm này', 'Cho em xem gần hơn được không ạ?']

type Props = {
  tourId: string
  talk: StudentTalk
  shared?: boolean
  /** In the waiting room: the guide may greet the group before the start. */
  waiting?: boolean
  /** ADR-0065: the ballot for the next POI, kept as the last card of the conversation while there is one. */
  vote?: ReactNode
  /** Changes when the ballot opens, closes or is decided, so the conversation scrolls it into view. */
  voteKey?: string
}

/**
 * ADR-0070: what the guide (the Tour's Operator) says to the group, by voice or text, and this browser's own text
 * replies. A reply reaches only the Staff, never the other Viewers. New voice clips play by themselves when the
 * browser allows it.
 */
export function StudentTalkPanel({ tourId, talk, shared = false, waiting = false, vote, voteKey }: Props) {
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const ballot = useRef<HTMLDivElement>(null)
  const { feed, messages, send } = talk
  const open = feed.data?.open ?? false
  const last = messages.at(-1)?.seq ?? 0

  // Show the newest message, or the top of the ballot card when it is taller than what is left below it; the
  // browser clamps the target, so a short card simply leaves the conversation at its end.
  const reveal = useCallback(() => {
    const viewport = end.current?.parentElement
    if (!viewport?.scrollTo) return
    const card = ballot.current?.firstElementChild
    const top = card ? card.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop - 8
      : viewport.scrollHeight
    viewport.scrollTo({ top })
  }, [])

  useEffect(reveal, [reveal, last, voteKey])

  // The panel sits in a tab that stays mounted while hidden; scroll again the moment it is shown.
  useEffect(() => {
    const viewport = end.current?.parentElement
    if (!viewport || typeof ResizeObserver === 'undefined') return
    let shown = viewport.clientHeight > 0
    const observer = new ResizeObserver(() => {
      const now = viewport.clientHeight > 0
      if (now && !shown) reveal()
      shown = now
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [reveal])

  const submit = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed || send.isPending) return
    send.mutate(trimmed, { onSuccess: () => setText('') })
  }

  return (
    <div className="st-ai st-talk">
      <div className="st-ai__head">
        <span className="st-narr__ic" aria-hidden="true"><Headset size={18} /></span>
        <div>
          <div className="st-ai__title">
            <span>Trò chuyện với hướng dẫn viên</span>
            {shared && <span className="st-ai__private"><Users size={10} />Màn hình chung</span>}
          </div>
          <p className="st-ai__ctx">
            {waiting ? 'Hướng dẫn viên có thể chào đoàn trước giờ bắt đầu. ' : ''}
            Hướng dẫn viên nói với cả đoàn; tin bạn trả lời chỉ hướng dẫn viên đọc được.
          </p>
        </div>
      </div>

      <div className="st-ai__msgs" aria-live="polite" aria-label="Tin nhắn với hướng dẫn viên">
        {feed.isPending && <p className="st-talk__empty">Đang tải…</p>}
        {!feed.isPending && messages.length === 0 && <p className="st-talk__empty">
          {open ? 'Hướng dẫn viên chưa nói gì. Khi có lời nhắn hoặc giọng nói mới, bạn sẽ nghe và thấy ở đây.'
            : 'Kênh trò chuyện mở từ 15 phút trước giờ bắt đầu.'}
        </p>}
        {messages.map(message => (
          <div key={message.id} className={message.from === 'STAFF' ? 'st-msg st-msg--ai' : 'st-msg st-msg--me'}>
            <div className="st-bubble">
              {message.from === 'STAFF' && <div className="st-bubble__meta"><span>{message.staffName ? `Hướng dẫn viên ${message.staffName}` : 'Hướng dẫn viên'}</span></div>}
              {message.hasAudio && <TalkAudioButton className="st-talk__audio" load={() => loadStudentTalkAudio(tourId, message.id)}
                durationMs={message.audioDurationMs} available={message.audioAvailable}
                autoPlay={talk.autoPlay(message)} onAutoPlay={() => talk.markPlayed(message)} />}
              {message.text && <p>{message.text}</p>}
            </div>
          </div>
        ))}
        {vote && <div className="st-talk__ballot" ref={ballot}>{vote}</div>}
        <div ref={end} />
      </div>

      {feed.isError && <div className="st-ai__err" role="alert"><AlertCircle size={13} /><span>Đang mất kết nối với kênh trò chuyện. Đang thử lại…</span></div>}
      {send.isError && <div className="st-ai__err" role="alert"><AlertCircle size={13} /><span>{talkErrorText(send.error)}</span></div>}

      {open && <>
        <div className="st-ai__sugg">
          <span>Trả lời nhanh:</span>
          {QUICK.map(quick => <button key={quick} type="button" disabled={send.isPending} onClick={() => submit(quick)}>{quick}</button>)}
        </div>
        <form className="st-ai__input" onSubmit={event => { event.preventDefault(); submit(text) }}>
          <input type="text" value={text} maxLength={TALK_MAX_TEXT} onChange={event => setText(event.target.value)}
            placeholder="Trả lời hướng dẫn viên…" aria-label="Trả lời hướng dẫn viên" disabled={send.isPending} />
          <button type="submit" className="st-round st-round--send" disabled={!text.trim() || send.isPending} aria-label="Gửi trả lời">
            <Send size={16} aria-hidden="true" />
          </button>
        </form>
      </>}
    </div>
  )
}

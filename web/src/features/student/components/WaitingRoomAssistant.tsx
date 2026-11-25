import { useEffect, useState } from 'react'
import { Bot } from 'lucide-react'
import { LiveStudentAiAssistant, type LiveStudentAiChat } from './LiveStudentAiAssistant'
import { waitingRoomAiOpensAt } from '../ai/waiting-room-window'

/**
 * The waiting room's AI chat: from 15 minutes before the start the group can ask about the school while it waits;
 * earlier a short note says when it opens. The server applies the same window, so a clock that is off only changes
 * when the box appears, never what is answered.
 */
export function WaitingRoomAssistant({ tourId, scheduledStartAt, shared, chat }: {
  tourId: string
  scheduledStartAt: string
  shared: boolean
  chat: LiveStudentAiChat
}) {
  const opensAt = waitingRoomAiOpensAt(scheduledStartAt)
  const [now, setNow] = useState(() => Date.now())
  const open = opensAt !== null && now >= opensAt
  useEffect(() => {
    if (open || opensAt === null) return
    // Wake exactly at the opening, capped so a sleeping laptop still catches up.
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(Math.max(opensAt - Date.now(), 0) + 50, 60_000))
    return () => window.clearTimeout(timer)
  }, [open, opensAt, now])
  if (opensAt === null) return null

  return <section className="st-x-card st-x-wait-ai" aria-label="Hỏi Trợ lý AI trong lúc chờ">
    {open ? <>
      <h4 className="st-x-sec"><Bot size={16} aria-hidden="true" /> Hỏi Trợ lý AI trong lúc chờ</h4>
      <LiveStudentAiAssistant tourId={tourId} shared={shared} chat={chat} waiting />
    </> : <p className="st-x-meta"><Bot size={16} aria-hidden="true" />
      <span>Trợ lý AI mở lúc {new Date(opensAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}, 15 phút trước giờ bắt đầu. Khi đó bạn có thể hỏi về trường và chuyến tham quan.</span></p>}
  </section>
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiClient } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'
import { readTalkFeed, TALK_POLL_MS, type TalkMessage } from '../../tour-talk/talk-types'

/**
 * ADR-0070, Viewer side: `/api/student/tours/{tourId}/talk`, authenticated only by the per-Tour Student cookie.
 * The Viewer reads the Operator's messages and its own replies.
 */
const path = (tourId: string) => `/api/student/tours/${encodeURIComponent(tourId)}/talk`
const key = (tourId: string) => ['student-talk', tourId] as const

export const loadStudentTalkAudio = (tourId: string, messageId: string) =>
  apiClient<Blob>(`${path(tourId)}/${encodeURIComponent(messageId)}/audio`, { credentials: 'include', auth: false, responseType: 'blob' })

/**
 * The conversation, how many Operator messages arrived since the panel was last looked at, and which voice clips are
 * new (they play by themselves). What was there when the page opened counts as already heard.
 */
export function useStudentTalk(tourId: string, enabled: boolean, viewing: boolean) {
  const client = useQueryClient()
  const feed = useQuery({
    queryKey: key(tourId),
    queryFn: ({ signal }) => apiClient<ApiResponse<unknown>>(path(tourId), { credentials: 'include', auth: false, signal })
      .then(response => readTalkFeed(response.data)),
    enabled: Boolean(tourId) && enabled,
    // A closed channel (waiting room long before the start, or after the end) is checked only now and then.
    refetchInterval: query => query.state.data?.open === false ? 30_000 : TALK_POLL_MS,
    retry: false,
  })
  const send = useMutation({
    mutationFn: (text: string) => apiClient<ApiResponse<TalkMessage>>(path(tourId), {
      method: 'POST', credentials: 'include', auth: false, json: { text },
    }),
    onSettled: () => client.invalidateQueries({ queryKey: key(tourId) }),
  })

  const messages = feed.data?.messages ?? []
  const staff = messages.filter(message => message.from === 'STAFF')
  const newestStaff = staff.at(-1)?.seq ?? 0
  const epoch = feed.data?.epoch ?? null

  // Seq of the newest Operator message present at first load (or after a server restart): older clips never autoplay.
  const [baseline, setBaseline] = useState<{ epoch: string; seq: number } | null>(null)
  const [seen, setSeen] = useState(0)
  if (epoch && baseline?.epoch !== epoch) {
    setBaseline({ epoch, seq: newestStaff })
    setSeen(viewing ? newestStaff : Math.min(seen, newestStaff))
  }
  if (viewing && newestStaff > seen) setSeen(newestStaff)

  const autoPlayFrom = baseline?.seq ?? Number.POSITIVE_INFINITY
  // Clips already played by themselves, so a panel that mounts again (waiting room -> live) does not replay them.
  const [played] = useState(() => new Set<string>())

  return {
    feed,
    messages,
    send,
    unread: staff.filter(message => message.seq > seen).length,
    /** A clip newer than what the page found on opening plays by itself, once. */
    autoPlay: (message: TalkMessage) => message.from === 'STAFF' && message.hasAudio && message.seq > autoPlayFrom
      && !played.has(message.id),
    markPlayed: (message: TalkMessage) => { played.add(message.id) },
  }
}

export type StudentTalk = ReturnType<typeof useStudentTalk>

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../../../api/client'
import type { ApiResponse } from '../../../../api/contracts/shared'
import { readTalkFeed, TALK_POLL_MS, type TalkMessage } from '../../../tour-talk/talk-types'
import type { RecordedClip } from '../../../tour-talk/use-voice-recorder'

/** ADR-0070, Staff side: `/api/staff/manage/tours/{id}/talk`. Any Staff reads; only the Operator sends. */
const path = (tourId: string) => `/api/staff/manage/tours/${encodeURIComponent(tourId)}/talk`

export const talkKeys = { feed: (tourId: string) => ['staff', 'tour-talk', tourId] as const }

export function useStaffTalkFeed(tourId: string, enabled: boolean) {
  return useQuery({
    queryKey: talkKeys.feed(tourId),
    queryFn: ({ signal }) => apiClient<ApiResponse<unknown>>(path(tourId), { signal }).then(response => readTalkFeed(response.data)),
    enabled: Boolean(tourId) && enabled,
    refetchInterval: TALK_POLL_MS,
    retry: false,
  })
}

export type StaffTalkSend = { text?: string; clip?: RecordedClip }

export function useSendStaffTalk(tourId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ text, clip }: StaffTalkSend) => {
      const form = new FormData()
      if (text?.trim()) form.append('text', text.trim())
      if (clip) {
        const extension = clip.type.includes('mp4') ? 'm4a' : clip.type.includes('ogg') ? 'ogg' : 'webm'
        form.append('audio', new File([clip.blob], `talk.${extension}`, { type: clip.type }))
        form.append('durationMs', String(Math.round(clip.durationMs)))
      }
      return apiClient<ApiResponse<TalkMessage>>(path(tourId), { method: 'POST', formData: form })
    },
    onSettled: () => client.invalidateQueries({ queryKey: talkKeys.feed(tourId) }),
  })
}

export const loadStaffTalkAudio = (tourId: string, messageId: string) =>
  apiClient<Blob>(`${path(tourId)}/${encodeURIComponent(messageId)}/audio`, { responseType: 'blob' })

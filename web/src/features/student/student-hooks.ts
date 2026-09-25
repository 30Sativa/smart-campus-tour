import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AiChatMessage, RosterMatchRequest } from './student-types'
import {
  mockGetStudentSnapshot,
  mockMatchStudentRequest,
  mockAskAiResponse,
} from '../../mocks/student-mock'
import { useStudentStore } from './student-store'

export function useStudentSnapshot(tourId?: string) {
  return useQuery({
    queryKey: ['student-tour-snapshot', tourId],
    queryFn: () => mockGetStudentSnapshot(tourId || 'tour-101'),
    refetchInterval: 3000, // Cập nhật vị trí & trạng thái realtime
  })
}

export function useStudentJoinMutation() {
  const setSession = useStudentStore((s) => s.setSession)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (req: RosterMatchRequest) => {
      // Simulate network latency
      await new Promise((r) => setTimeout(r, 400))
      const res = mockMatchStudentRequest(req)
      if (!res.success || !res.session) {
        throw new Error(res.errorMessage || 'Xác nhận thông tin thất bại')
      }
      return res.session
    },
    onSuccess: (session) => {
      setSession(session)
      queryClient.invalidateQueries({ queryKey: ['student-tour-snapshot', session.tourId] })
    },
  })
}

export function useStudentAiChat(poiContext?: string) {
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Chào bạn! Mình là Trợ lý AI Hướng dẫn viên Campus. Bạn có thắc mắc gì về điểm tham quan hiện tại hay đời sống sinh viên không?',
      timestamp: 'Vừa xong',
    },
  ])
  const [isTyping, setIsTyping] = useState(false)
  const setIsAiSpeaking = useStudentStore((s) => s.setIsAiSpeaking)

  const askAi = async (text: string) => {
    if (!text.trim() || isTyping) return

    const studentMsgId = `st_${Date.now()}`
    const newMsg: AiChatMessage = {
      id: studentMsgId,
      sender: 'student',
      text: text.trim(),
      timestamp: 'Vừa xong',
      poiContext,
      status: 'sent',
    }

    setMessages((prev) => [...prev, newMsg])
    setIsTyping(true)

    try {
      const responseText = await mockAskAiResponse(text, poiContext)

      const aiMsg: AiChatMessage = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: responseText,
        timestamp: 'Vừa xong',
        poiContext,
        isAudioPlaying: true,
      }

      setMessages((prev) => [...prev, aiMsg])

      // Audio ducking: Báo hệ thống hạ âm lượng thuyết minh trong lúc AI phát âm thanh
      setIsAiSpeaking(true)
      // Giả lập thời lượng giọng đọc AI nói (tính theo độ dài câu)
      const speechDuration = Math.min(8000, Math.max(3000, responseText.length * 50))
      setTimeout(() => {
        setIsAiSpeaking(false)
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsg.id ? { ...m, isAudioPlaying: false } : m))
        )
      }, speechDuration)
    } catch {
      const errorMsg: AiChatMessage = {
        id: `err_${Date.now()}`,
        sender: 'ai',
        text: 'Xin lỗi bạn, kết nối tới Trợ lý AI tạm thời bị gián đoạn. Bạn vui lòng thử lại nhé!',
        timestamp: 'Vừa xong',
        status: 'error',
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsTyping(false)
    }
  }

  return {
    messages,
    isTyping,
    askAi,
  }
}

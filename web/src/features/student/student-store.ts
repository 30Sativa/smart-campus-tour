import { create } from 'zustand'
import type { StudentSession } from './student-types'

const SESSION_STORAGE_KEY = 'campus_tour_student_session'

function getInitialSession(): StudentSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StudentSession
  } catch {
    return null
  }
}

/** Tab of the live-tour panel (desktop and phone share it). */
export type StudentLiveTab = 'stream' | 'map' | 'ai' | 'route'

interface StudentStoreState {
  session: StudentSession | null
  setSession: (session: StudentSession | null) => void
  clearSession: () => void

  // Audio ducking & playback control
  audioMuted: boolean
  setAudioMuted: (muted: boolean) => void
  isAiSpeaking: boolean
  setIsAiSpeaking: (speaking: boolean) => void

  // Live-tour panel tab
  activeTab: StudentLiveTab
  setActiveTab: (tab: StudentLiveTab) => void
}

export const useStudentStore = create<StudentStoreState>((set) => ({
  session: getInitialSession(),

  setSession: (session) => {
    if (session) {
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
      } catch {
        // ignore storage errors
      }
    } else {
      try {
        sessionStorage.removeItem(SESSION_STORAGE_KEY)
      } catch {
        // ignore storage errors
      }
    }
    set({ session })
  },

  clearSession: () => {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
    } catch {
      // ignore
    }
    set({ session: null })
  },

  audioMuted: false,
  setAudioMuted: (audioMuted) => set({ audioMuted }),

  isAiSpeaking: false,
  setIsAiSpeaking: (isAiSpeaking) => set({ isAiSpeaking }),

  activeTab: 'stream',
  setActiveTab: (activeTab) => set({ activeTab }),
}))

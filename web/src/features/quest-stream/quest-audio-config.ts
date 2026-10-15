import { audioPath } from './audio-peer'

export const QUEST_AUDIO_PATH = audioPath(import.meta.env.VITE_QUEST_AUDIO_PATH)
export const STAFF_AUDIO_PATH = audioPath(import.meta.env.VITE_STAFF_AUDIO_PATH)
export const QUEST_AUDIO_CONFIGURED = Boolean(QUEST_AUDIO_PATH && STAFF_AUDIO_PATH && QUEST_AUDIO_PATH !== STAFF_AUDIO_PATH)

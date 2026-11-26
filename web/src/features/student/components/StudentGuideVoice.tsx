import { Mic, Volume2 } from 'lucide-react'
import type { GuideVoice } from '../../tour-talk/guide-voice'

/**
 * ADR-0072: shows that the guide is speaking live, or a button when the browser held the guide's voice back until a
 * click. Nothing while the guide is silent.
 */
export function StudentGuideVoice({ voice }: { voice: GuideVoice }) {
  if (voice.blocked) {
    return <button type="button" className="st-guide-voice st-guide-voice--blocked" onClick={voice.enable}>
      <Volume2 size={16} aria-hidden="true" />Bật tiếng hướng dẫn viên
    </button>
  }
  return <p className="st-guide-voice" role="status" hidden={!voice.speaking}>
    {voice.speaking && <><Mic size={15} aria-hidden="true" /><span>Hướng dẫn viên đang nói</span></>}
  </p>
}

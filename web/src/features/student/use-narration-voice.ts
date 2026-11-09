/**
 * Plays the prepared narration of the stop the robot has just reached, in the Student's own browser.
 *
 * The Quest live stream is video only (robot/quest-stream drops audio), so the voice is produced here:
 * the POI's `audioUrl` file when one is set, otherwise the POI's narration text read aloud by the browser's
 * Vietnamese speech voice. Each arrival plays once; "Nghe lại" plays it again.
 *
 * Browsers refuse sound before the visitor has clicked the page. In that case `blocked` turns true and the
 * pending narration starts as soon as `enable()` is called from a click.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type NarrationSource = {
  poiId: string
  text: string
  audioUrl?: string
  /** True while the robot is presenting this stop (Tour step OBSERVING). */
  isPlaying: boolean
}

export type NarrationVoice = {
  /** Sound is coming out right now. */
  speaking: boolean
  /** The browser refused to start sound without a click. */
  blocked: boolean
  /** Voices are listed but none speaks Vietnamese, so the text would be read with a foreign accent. */
  noVietnameseVoice: boolean
  /** Call from a click: unlocks sound and starts the narration that was refused. */
  enable: () => void
  /** Plays the current stop's narration again from the start. */
  replay: () => void
  stop: () => void
}

const MAX_CHUNK = 180

/** Sentence-sized chunks: Chrome silently stops one long utterance after about 15 seconds. */
export function splitForSpeech(text: string, max = MAX_CHUNK): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?…;:]+[.!?…;:]*/g) ?? []
  const chunks: string[] = []
  for (const raw of sentences) {
    const sentence = raw.trim()
    if (!sentence) continue
    if (sentence.length <= max) { chunks.push(sentence); continue }
    let line = ''
    for (const word of sentence.split(' ')) {
      if (line && (line + ' ' + word).length > max) { chunks.push(line); line = word }
      else line = line ? `${line} ${word}` : word
    }
    if (line) chunks.push(line)
  }
  return chunks
}

/** A Vietnamese voice, preferring the installed (offline) one. */
export function pickVietnameseVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const vi = voices.filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith('vi'))
  return vi.find((v) => v.localService) ?? vi[0]
}

function speechApi(): SpeechSynthesis | undefined {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : undefined
}

function hasUserActivation(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  return activation ? activation.hasBeenActive : true
}

type RunCallbacks = { done: () => void; refused: () => void }

/** Plays a prepared narration file. */
function playFile(el: HTMLAudioElement, url: string, { done, refused }: RunCallbacks): void {
  el.src = url
  el.currentTime = 0
  el.onended = done
  el.onerror = done
  el.onpause = done
  el.play().catch((error: unknown) => {
    if (error instanceof DOMException && error.name === 'NotAllowedError') refused()
    else done()
  })
}

/** Queues the narration text sentence by sentence on the browser's speech voice. */
function speakText(api: SpeechSynthesis, text: string, voice: SpeechSynthesisVoice | undefined, { done, refused }: RunCallbacks): boolean {
  const chunks = splitForSpeech(text)
  if (chunks.length === 0) return false
  chunks.forEach((chunk, index) => {
    const utterance = new SpeechSynthesisUtterance(chunk)
    utterance.lang = voice?.lang ?? 'vi-VN'
    if (voice) utterance.voice = voice
    utterance.rate = 1
    if (index === chunks.length - 1) utterance.onend = done
    utterance.onerror = (event) => { if (event.error === 'not-allowed') refused(); else done() }
    api.speak(utterance)
  })
  return true
}

export function useNarrationVoice(narration: NarrationSource | undefined, muted: boolean): NarrationVoice {
  const [speaking, setSpeaking] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [noVietnameseVoice, setNoVietnameseVoice] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const voice = useRef<SpeechSynthesisVoice | undefined>(undefined)
  /** poiId whose arrival has already been narrated (or skipped while muted); cleared while the robot travels. */
  const handled = useRef<string | null>(null)
  /** Bumped on every start so callbacks of an older narration are ignored. */
  const run = useRef(0)
  const latest = useRef(narration)
  useEffect(() => { latest.current = narration })

  useEffect(() => {
    const api = speechApi()
    if (!api) return
    const load = () => {
      const voices = api.getVoices()
      voice.current = pickVietnameseVoice(voices)
      setNoVietnameseVoice(voices.length > 0 && !voice.current)
    }
    load()
    api.addEventListener?.('voiceschanged', load)
    return () => api.removeEventListener?.('voiceschanged', load)
  }, [])

  /** Silences the device; the playing narration's own pause/cancel events clear `speaking`. */
  const silence = useCallback(() => {
    audio.current?.pause()
    speechApi()?.cancel()
  }, [])

  const start = useCallback((source: NarrationSource) => {
    run.current += 1
    silence()
    const id = run.current
    const callbacks: RunCallbacks = {
      done: () => { if (run.current === id) setSpeaking(false) },
      refused: () => { if (run.current === id) { setSpeaking(false); setBlocked(true) } },
    }

    if (source.audioUrl) {
      if (!audio.current) audio.current = new Audio()
      playFile(audio.current, source.audioUrl, callbacks)
    } else {
      const api = speechApi()
      if (!api) return
      if (!hasUserActivation()) { callbacks.refused(); return }
      if (!speakText(api, source.text, voice.current, callbacks)) return
    }
    setBlocked(false)
    setSpeaking(true)
  }, [silence])

  // Arriving at a stop starts its narration once; travelling between stops re-arms it.
  useEffect(() => {
    if (!narration) { handled.current = null; return }
    if (!narration.isPlaying || handled.current === narration.poiId) return
    const timer = setTimeout(() => {
      handled.current = narration.poiId
      if (!muted) start(narration)
    }, 0)
    return () => clearTimeout(timer)
  }, [narration, muted, start])

  // Muting cuts the voice at once.
  useEffect(() => { if (muted) silence() }, [muted, silence])

  // Leaving the page or the Tour ending stops any sound.
  useEffect(() => () => { run.current += 1; silence() }, [silence])

  const replay = useCallback(() => {
    const current = latest.current
    if (current) start(current)
  }, [start])

  const enable = useCallback(() => {
    setBlocked(false)
    const current = latest.current
    if (current?.isPlaying) start(current)
  }, [start])

  const stop = useCallback(() => { run.current += 1; silence(); setSpeaking(false) }, [silence])

  return { speaking: speaking && !muted, blocked, noVietnameseVoice, enable, replay, stop }
}

/**
 * Reads `text` once with the same voice and sentence chunks the Student page uses, for the POI form's
 * "Nghe thử" button. Called from a click, so the browser allows the sound. Returns a function that stops it.
 */
export function previewNarration(text: string, onEnd: () => void): () => void {
  const api = speechApi()
  if (!api || !splitForSpeech(text).length) { onEnd(); return () => {} }
  api.cancel()
  let finished = false
  const done = () => { if (!finished) { finished = true; onEnd() } }
  speakText(api, text, pickVietnameseVoice(api.getVoices()), { done, refused: done })
  return () => { api.cancel(); done() }
}

/** False when the browser has no speech synthesis at all. */
export const canPreviewNarration = () => !!speechApi()

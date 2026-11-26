/**
 * ADR-0072: the Operator's live voice to every Viewer of a Tour, over the stream relay (`voice-{tourId}`).
 *
 * The Operator publishes the microphone over WHIP and Viewers read it over WHEP, each with a short token from the
 * backend on `?token=`. The relay asks the backend on every connection and its reaper cuts a session whose Tour ended
 * or whose Viewer was revoked. Push-to-talk keeps the connection open after the first press and only switches the
 * microphone track on while the button is held, so later presses are heard at once.
 */
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiClient } from '../../api/client'
import type { ApiResponse } from '../../api/contracts/shared'
import { openAudioPeer, type AudioPeer } from '../quest-stream/audio-peer'
import { NOT_AVAILABLE_RETRY_MS, renewDelayMs, withToken } from '../quest-stream/stream-access'
import { errorCode } from './talk-types'

export type GuideVoiceAccess = { url: string; token: string; expiresAt: string }

export function readVoiceAccess(data: unknown): GuideVoiceAccess | null {
  const access = data as Partial<GuideVoiceAccess> | null | undefined
  return access && typeof access.url === 'string' && access.url && typeof access.token === 'string' && access.token
    && typeof access.expiresAt === 'string' ? { url: access.url, token: access.token, expiresAt: access.expiresAt } : null
}

const staffPath = (tourId: string) => `/api/staff/manage/tours/${encodeURIComponent(tourId)}/talk/voice-access`
const studentPath = (tourId: string) => `/api/student/tours/${encodeURIComponent(tourId)}/talk/voice-access`

export const loadStaffVoiceAccess = (tourId: string, signal?: AbortSignal) =>
  apiClient<ApiResponse<unknown>>(staffPath(tourId), { signal }).then(response => {
    const access = readVoiceAccess(response?.data)
    if (!access) throw new Error('Bad voice access')
    return access
  })

// ---------------------------------------------------------------------------------------------- Operator side

export type PushToTalkState = 'idle' | 'connecting' | 'ready' | 'unsupported' | 'denied' | 'unavailable' | 'error'

export type PushToTalk = {
  state: PushToTalkState
  /** The button is held (or latched): the microphone is switched on. */
  talking: boolean
  press: () => void
  release: () => void
}

type Session = { abort: AbortController; mic: MediaStream; peer?: AudioPeer }

const MIC: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }

function failure(error: unknown): PushToTalkState {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) return 'denied'
  if (error instanceof ApiError && error.status === 409 && errorCode(error) === 'VOICE_NOT_AVAILABLE') return 'unavailable'
  return 'error'
}

/**
 * The Operator's push-to-talk. The first press asks for the microphone and connects; the connection then stays open
 * (sending silence) until the page closes or the channel is disabled, so every later press is heard immediately.
 */
export function usePushToTalk(tourId: string, enabled: boolean): PushToTalk {
  const supported = typeof window !== 'undefined' && typeof RTCPeerConnection !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
  const [state, setState] = useState<PushToTalkState>(supported ? 'idle' : 'unsupported')
  const [talking, setTalking] = useState(false)
  const held = useRef(false)
  const session = useRef<Session | null>(null)

  const close = useCallback(() => {
    const current = session.current
    session.current = null
    if (!current) return
    current.abort.abort()
    current.peer?.close()
    current.mic.getTracks().forEach(track => track.stop())
  }, [])

  const connect = useCallback(async () => {
    if (session.current) return
    setState('connecting')
    const abort = new AbortController()
    let mic: MediaStream
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: MIC })
    } catch (error) { setState(failure(error)); return }
    if (session.current) { mic.getTracks().forEach(track => track.stop()); return }
    mic.getAudioTracks().forEach(track => { track.enabled = held.current })
    const current: Session = { abort, mic }
    session.current = current
    try {
      const access = await loadStaffVoiceAccess(tourId, abort.signal)
      const peer = await openAudioPeer({
        url: withToken(access.url, access.token), signal: abort.signal, stream: mic,
        onConnected: () => { if (session.current === current) setState('ready') },
        onFailure: () => { if (session.current === current) { close(); setState('error') } },
      })
      if (session.current === current) current.peer = peer
      else peer.close()
    } catch (error) {
      if (session.current !== current) return
      close()
      setState(failure(error))
    }
  }, [tourId, close])

  const press = useCallback(() => {
    if (!enabled || !supported || held.current) return
    held.current = true
    setTalking(true)
    session.current?.mic.getAudioTracks().forEach(track => { track.enabled = true })
    if (!session.current) void connect()
  }, [enabled, supported, connect])

  const release = useCallback(() => {
    if (!held.current) return
    held.current = false
    setTalking(false)
    session.current?.mic.getAudioTracks().forEach(track => { track.enabled = false })
  }, [])

  // The channel closing (Tour ended, another Operator) or leaving the page hangs up and frees the microphone.
  useEffect(() => {
    if (enabled) return
    held.current = false
    close()
    const timer = setTimeout(() => { setTalking(false); setState(current => current === 'unsupported' ? current : 'idle') }, 0)
    return () => clearTimeout(timer)
  }, [enabled, close])
  useEffect(() => close, [close])

  return { state, talking, press, release }
}

// ------------------------------------------------------------------------------------------------ Viewer side

export type GuideVoice = {
  /** The guide's voice is coming through right now. */
  speaking: boolean
  /** The browser refused to play sound without a click. */
  blocked: boolean
  /** Call from a click: lets the guide's voice play. */
  enable: () => void
}

/** Retry while the Operator is not on air (the relay answers 404 until someone publishes): quick at first, then calmer. */
export function nextRetryMs(previous: number): number {
  return previous ? Math.min(10_000, Math.round(previous * 1.5)) : 3_000
}

function autoplayingAudio(): HTMLAudioElement {
  const el = new Audio()
  el.autoplay = true
  return el
}

const SPEAKING_LEVEL = 0.015
const SPEAKING_HOLD_MS = 900

function useStudentVoiceAccess(tourId: string, enabled: boolean): GuideVoiceAccess | null {
  const query = useQuery({
    queryKey: ['student-guide-voice', tourId],
    queryFn: ({ signal }) => apiClient<ApiResponse<unknown>>(studentPath(tourId), { credentials: 'include', auth: false, signal })
      .then(response => readVoiceAccess(response?.data)),
    enabled,
    retry: false,
    refetchInterval: q => (q.state.data && !q.state.error ? renewDelayMs(q.state.data.expiresAt) : NOT_AVAILABLE_RETRY_MS),
  })
  if (!enabled || query.isError) return null
  return query.data ?? null
}

/**
 * The invited Viewer hears the Operator live. Connects while the talk channel is open and the backend hands a token,
 * retries while nobody is on air, and follows the page's mute. An open connection is kept across token renewals; the
 * relay's reaper ends it when access ends.
 */
export function useGuideVoice(tourId: string, enabled: boolean, muted: boolean): GuideVoice {
  const access = useStudentVoiceAccess(tourId, enabled)
  const latest = useRef(access)
  useEffect(() => { latest.current = access })
  const available = Boolean(access)
  const [speaking, setSpeaking] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const context = useRef<AudioContext | null>(null)

  const play = useCallback(() => {
    const el = audio.current
    if (!el?.srcObject) return
    el.play().then(() => setBlocked(false), (error: unknown) => {
      if (error instanceof DOMException && error.name === 'NotAllowedError') setBlocked(true)
    })
  }, [])

  useEffect(() => {
    if (!enabled || !available) return
    const abort = new AbortController()
    const el = audio.current ?? (audio.current = autoplayingAudio())
    let peer: AudioPeer | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    let meter: ReturnType<typeof setInterval> | undefined
    let delay = 0

    const listen = (track: MediaStreamTrack) => {
      const stream = new MediaStream([track])
      el.srcObject = stream
      play()
      clearInterval(meter)
      const Context = typeof window !== 'undefined' ? window.AudioContext : undefined
      if (!Context) return
      const ctx = context.current ?? (context.current = new Context())
      void ctx.resume?.()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analyser)
      const samples = new Float32Array(analyser.fftSize)
      let lastLoud = 0
      meter = setInterval(() => {
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) sum += sample * sample
        const now = Date.now()
        if (Math.sqrt(sum / samples.length) > SPEAKING_LEVEL) lastLoud = now
        setSpeaking(now - lastLoud < SPEAKING_HOLD_MS)
      }, 150)
    }

    const again = () => {
      if (abort.signal.aborted) return
      clearInterval(meter)
      setSpeaking(false)
      delay = nextRetryMs(delay)
      clearTimeout(retry)
      retry = setTimeout(attempt, delay)
    }

    async function attempt() {
      const current = latest.current
      if (!current || abort.signal.aborted) return
      try {
        peer = await openAudioPeer({
          url: withToken(current.url, current.token), signal: abort.signal,
          onTrack: listen,
          onConnected: () => { delay = 0 },
          onFailure: again,
        })
      } catch { again() }
    }

    void attempt()
    return () => {
      abort.abort()
      clearTimeout(retry)
      clearInterval(meter)
      peer?.close()
      el.pause()
      el.srcObject = null
      setSpeaking(false)
    }
  }, [enabled, available, play])

  useEffect(() => { if (audio.current) audio.current.muted = muted }, [muted, available])

  useEffect(() => () => { void context.current?.close?.(); context.current = null }, [])

  const enable = useCallback(() => {
    void context.current?.resume?.()
    play()
  }, [play])

  return { speaking: speaking && !muted, blocked: blocked && available, enable }
}

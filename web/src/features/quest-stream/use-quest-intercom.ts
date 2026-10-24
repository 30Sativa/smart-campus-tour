import { useEffect, useRef, useState } from 'react'
import { AudioPeerError, openAudioPeer, type AudioPeer } from './audio-peer'
import { QUEST_ICE_SERVERS } from './quest-stream-config'

type IntercomState = 'idle' | 'connecting' | 'waiting' | 'connected' | 'error'
export function useQuestIntercom(publishPath: string | null, readPath: string | null) {
  const audio = useRef<HTMLAudioElement>(null)
  const [state, setState] = useState<IntercomState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(true)
  const [speakerBlocked, setSpeakerBlocked] = useState(false)
  const active = useRef<{ abort: AbortController; mic?: MediaStream; peers: AudioPeer[] } | null>(null)

  function dispose() {
    const session = active.current
    active.current = null
    session?.abort.abort()
    session?.peers.forEach(peer => peer.close())
    session?.mic?.getTracks().forEach(track => track.stop())
    if (audio.current) { audio.current.pause(); audio.current.srcObject = null }
  }
  useEffect(() => () => {
    const session = active.current
    active.current = null
    session?.abort.abort()
    session?.peers.forEach(peer => peer.close())
    session?.mic?.getTracks().forEach(track => track.stop())
  }, [])

  async function start(username: string, password: string) {
    if (active.current || !publishPath || !readPath || !username || !password) return
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      setError('Cần trang HTTPS, trình duyệt hỗ trợ WebRTC và quyền dùng microphone.'); setState('error'); return
    }
    const session = { abort: new AbortController(), mic: undefined as MediaStream | undefined, peers: [] as AudioPeer[] }
    active.current = session
    const current = () => active.current === session && !session.abort.signal.aborted
    let published = false
    let received = false
    const connected = () => { if (current() && published && received) setState('connected') }
    const fail = (failure?: unknown) => {
      if (!current()) return
      dispose()
      setState('error')
      setMuted(true)
      const name = failure instanceof Error ? failure.name : ''
      setError(name === 'NotAllowedError' ? 'Microphone chưa được cho phép. Kiểm tra quyền microphone rồi kết nối lại.'
        : failure instanceof AudioPeerError && [401, 403].includes(failure.status ?? 0) ? 'Tài khoản âm thanh không đúng hoặc chưa được cấp quyền cho hai luồng.'
        : 'Mất kết nối âm thanh. Kiểm tra MediaMTX, HTTPS và mạng rồi kết nối lại.')
    }
    setState('connecting'); setError(null); setMuted(true); setSpeakerBlocked(false)
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ video: false,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      if (!current()) { mic.getTracks().forEach(track => track.stop()); return }
      session.mic = mic
      mic.getAudioTracks().forEach(track => {
        track.enabled = false
        track.addEventListener('ended', () => fail(), { once: true })
      })
      const authorization = 'Basic ' + btoa(String.fromCharCode(...new TextEncoder().encode(`${username}:${password}`)))
      const common = { authorization, signal: session.abort.signal, iceServers: QUEST_ICE_SERVERS, onFailure: () => fail() }
      session.peers.push(await openAudioPeer({ ...common, url: publishPath + '/whip', stream: mic,
        onConnected: () => { published = true; connected() } }))
      if (!current()) return
      setState('waiting')
      // The other side may join later. A missing publisher must not close our microphone stream.
      while (current()) {
        try {
          const reader = await openAudioPeer({ ...common, url: readPath + '/whep',
            onConnected: () => { received = true; connected() },
            onTrack: track => {
              if (!current() || !audio.current) return
              audio.current.srcObject = new MediaStream([track])
              void audio.current.play().catch(() => { if (current()) setSpeakerBlocked(true) })
            } })
          session.peers.push(reader)
          return
        } catch (failure) {
          if (!current()) return
          if (!(failure instanceof AudioPeerError) || failure.status !== 404) throw failure
          await new Promise<void>(resolve => {
            const done = () => { clearTimeout(timer); session.abort.signal.removeEventListener('abort', done); resolve() }
            const timer = setTimeout(done, 2000)
            session.abort.signal.addEventListener('abort', done, { once: true })
          })
        }
      }
    } catch (failure) { fail(failure) }
  }
  function toggleMic() {
    if (!active.current?.mic) return
    const next = !muted
    active.current.mic.getAudioTracks().forEach(track => { track.enabled = !next })
    setMuted(next)
  }
  async function playSpeaker() {
    try { await audio.current?.play(); setSpeakerBlocked(false) }
    catch { setSpeakerBlocked(true) }
  }
  function stop() { dispose(); setState('idle'); setError(null); setMuted(true); setSpeakerBlocked(false) }
  return { audio, state, error, muted, speakerBlocked, start, stop, toggleMic, playSpeaker }
}

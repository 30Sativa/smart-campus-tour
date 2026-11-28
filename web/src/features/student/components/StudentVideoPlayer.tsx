import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Captions,
  CaptionsOff,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useStudentStore } from '../student-store'
import { DEV_QUEST_SOURCE, type QuestSource } from '../../quest-stream/stream-access'
import { useWhepStream } from '../../quest-stream/use-whep-stream'
import { usePageVisible } from '../../quest-stream/use-page-visible'

interface StudentVideoPlayerProps {
  streamUrl?: string
  statusLabel?: string
  onReplayNarration?: () => void
  /**
   * False for the copy of the player that the current layout hides (the live
   * view renders one for desktop and one for mobile), so the Quest stream is
   * only pulled once.
   */
  active?: boolean
  /** Replaces the "Trực tiếp" badge, e.g. "Video dự phòng" for a Tour's fallback video. */
  badge?: string
  /** Shown over the poster when there is neither a Quest stream nor a video source. */
  emptyMessage?: string
  /** The live relay URL and token from the API (ADR-0055); null = no live stream. Defaults to the dev-only LAN URL. */
  quest?: QuestSource | null
  /**
   * ADR-0075: the Tour's fallback video on the relay, with its own token. The page holds it only while the Operator
   * has switched the Tour to the fallback video; the player then shows a notice, plays the recording muted with its
   * label, and goes back to live when it is gone. A lost live picture alone never opens it (no automatic switching).
   */
  fallback?: QuestSource | null
  /** The narration sentence being read now, shown as a subtitle over the picture (also in full screen). */
  caption?: string | null
  /** A live element shown over the picture, e.g. the guide's voice status. */
  overlay?: ReactNode
}

export const FALLBACK_BADGE = 'Bản ghi hành trình – không phải trực tiếp'
export const FALLBACK_NOTICE = 'Hình trực tiếp tạm gián đoạn. Đang chuyển sang bản ghi hành trình…'
export const LIVE_RESTORED_NOTICE = 'Đã trở lại hình trực tiếp'
/** How long the notice shows before the recording starts, and after it ends. */
export const FALLBACK_NOTICE_MS = 3000
export const LIVE_RESTORED_NOTICE_MS = 4000

type FallbackPhase = 'live' | 'notice' | 'recording' | 'restored'

const QUEST_WAITING: Record<'idle' | 'connecting' | 'offline' | 'error', string> = {
  idle: 'Đang chờ nguồn hình…',
  connecting: 'Đang kết nối hình ảnh trực tiếp từ robot…',
  offline: 'Tạm mất hình ảnh trực tiếp. Đang tự kết nối lại…',
  error: 'Trình duyệt này không phát được hình trực tiếp (WebRTC). Hãy dùng Chrome, Edge hoặc Safari.',
}

export function StudentVideoPlayer({
  streamUrl,
  statusLabel = 'Trực tiếp từ Robot AMR',
  onReplayNarration,
  active = true,
  badge,
  emptyMessage,
  quest = DEV_QUEST_SOURCE,
  fallback = null,
  caption = null,
  overlay,
}: StudentVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fallbackRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showAutoplayOverlay, setShowAutoplayOverlay] = useState(false)
  // The viewer may pause the live picture; a hidden tab stops pulling it too. Both close the
  // WebRTC connection, so nobody downloads a picture nobody sees (ADR-0052).
  const [livePaused, setLivePaused] = useState(false)
  const visible = usePageVisible()

  const audioMuted = useStudentStore((s) => s.audioMuted)
  const setAudioMuted = useStudentStore((s) => s.setAudioMuted)
  const isAiSpeaking = useStudentStore((s) => s.isAiSpeaking)
  const captionsOn = useStudentStore((s) => s.captionsOn)
  const setCaptionsOn = useStudentStore((s) => s.setCaptionsOn)

  // ADR-0075: the Operator switched the Tour to the fallback video while the page holds its token. A notice comes
  // first, then the recording; when the token is gone (switched back to live) a short notice says so.
  const fallbackUrl = fallback?.whepUrl ?? null
  const [phase, setPhase] = useState<FallbackPhase>(fallbackUrl ? 'notice' : 'live')
  if (fallbackUrl && (phase === 'live' || phase === 'restored')) setPhase('notice')
  if (!fallbackUrl && (phase === 'notice' || phase === 'recording')) setPhase(phase === 'recording' ? 'restored' : 'live')
  useEffect(() => {
    if (phase !== 'notice' && phase !== 'restored') return
    const timer = setTimeout(() => setPhase(phase === 'notice' ? 'recording' : 'live'),
      phase === 'notice' ? FALLBACK_NOTICE_MS : LIVE_RESTORED_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [phase])
  const recording = phase === 'recording' && Boolean(fallbackUrl)

  // With a relay source from the API, the Quest 3 live stream (WebRTC from
  // MediaMTX) replaces the tour's video source; the hook owns connecting and
  // reconnecting it. It rests while the recording plays: the Operator switches back when the headset works again.
  const questUrl = quest?.whepUrl ?? null
  const sampleVideo = !questUrl && streamUrl?.startsWith('/videos/')
  const { status: questStatus, retry: retryQuest } = useWhepStream(videoRef, questUrl,
    active && !livePaused && visible && !recording, quest?.token)
  // The recording is always muted (no audio track asked for); the approved narration keeps playing on the page.
  const { status: fallbackStatus } = useWhepStream(fallbackRef, recording ? fallbackUrl : null, active && visible, fallback?.token)
  const paused = Boolean(questUrl && livePaused && !recording)
  const questWaiting = questUrl && !paused && !recording && phase !== 'notice' && questStatus !== 'live' ? questStatus : null
  const fallbackWaiting = recording && fallbackStatus !== 'live' ? fallbackStatus : null
  const noSource = !questUrl && !streamUrl && !fallbackUrl

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Audio ducking: Giảm volume xuống 0.2 nếu AI đang nói
    video.volume = isAiSpeaking ? 0.2 : 1.0
  }, [isAiSpeaking])

  useEffect(() => {
    const video = videoRef.current
    if (!video || questUrl || !streamUrl) return

    const tryPlay = async () => {
      try {
        video.muted = audioMuted
        await video.play()
        setShowAutoplayOverlay(false)
      } catch {
        // Autoplay with sound was prevented by browser policy
        setShowAutoplayOverlay(true)
        video.muted = true
        void video.play()
      }
    }

    void tryPlay()
  }, [audioMuted, streamUrl, questUrl])

  const toggleMute = () => {
    const nextMuted = !audioMuted
    setAudioMuted(nextMuted)
    if (videoRef.current) {
      videoRef.current.muted = nextMuted
    }
    if (!nextMuted) {
      setShowAutoplayOverlay(false)
    }
  }

  const handleUnmuteClick = () => {
    setAudioMuted(false)
    setShowAutoplayOverlay(false)
    if (videoRef.current) {
      videoRef.current.muted = false
    }
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen().then(() => setIsFullscreen(true))
    } else {
      void document.exitFullscreen().then(() => setIsFullscreen(false))
    }
  }

  return (
    <div ref={containerRef} className="st-video">
      <video
        ref={videoRef}
        src={questUrl ? undefined : streamUrl}
        poster="/images/student-campus.png"
        loop={!questUrl}
        playsInline
        autoPlay
        muted={audioMuted}
      />
      {recording && (
        <video
          ref={fallbackRef}
          aria-label="Bản ghi hành trình"
          poster="/images/student-campus.png"
          className="st-video__fallback"
          playsInline
          autoPlay
          muted
        />
      )}

      <div className="st-video__top">
        <div className="st-video__badges">
          {paused ? (
            <span className="st-badge st-badge--dark">Tạm dừng</span>
          ) : recording ? (
            <span className="st-badge st-badge--sample">{FALLBACK_BADGE}</span>
          ) : questWaiting ? (
            <span className="st-badge st-badge--dark">{questWaiting === 'connecting' ? 'Đang kết nối' : 'Mất tín hiệu'}</span>
          ) : noSource ? (
            <span className="st-badge st-badge--dark">Chưa có hình</span>
          ) : badge ? (
            <span className="st-badge st-badge--sample">{badge}</span>
          ) : sampleVideo ? (
            <span className="st-badge st-badge--sample">Video minh họa</span>
          ) : (
            <span className="st-badge st-badge--live"><i />Trực tiếp</span>
          )}
          <span className="st-badge st-badge--dark">{statusLabel}</span>
        </div>
        {/* Audio ducking indicator if active */}
        {isAiSpeaking && <span className="st-badge st-badge--accent">AI đang trả lời</span>}
      </div>

      {questWaiting && (
        <div className="st-video__overlay" role="status">
          <p>{QUEST_WAITING[questWaiting]}</p>
          {(questWaiting === 'offline' || questWaiting === 'error') && (
            <button type="button" onClick={retryQuest} className="st-btn st-btn--light">
              <span>Thử lại ngay</span>
              <span className="st-btn__ic" aria-hidden="true"><RotateCcw size={16} /></span>
            </button>
          )}
        </div>
      )}

      {phase === 'notice' && (
        <div className="st-video__overlay" role="status">
          <p>{FALLBACK_NOTICE}</p>
        </div>
      )}

      {fallbackWaiting && fallbackWaiting !== 'idle' && (
        <div className="st-video__overlay" role="status">
          <p>{fallbackWaiting === 'connecting'
            ? 'Đang mở bản ghi hành trình…'
            : 'Chưa mở được bản ghi hành trình. Đang thử lại…'}</p>
        </div>
      )}

      {phase === 'restored' && questStatus === 'live' && (
        <p className="st-video__notice" role="status">{LIVE_RESTORED_NOTICE}</p>
      )}

      {paused && (
        <div className="st-video__overlay" role="status">
          <p>Đã tạm dừng hình trực tiếp. Thuyết minh vẫn phát bình thường.</p>
          <button type="button" onClick={() => setLivePaused(false)} className="st-btn st-btn--light">
            <span>Tiếp tục xem</span>
            <span className="st-btn__ic" aria-hidden="true"><Play size={16} /></span>
          </button>
        </div>
      )}

      {noSource && emptyMessage && (
        <div className="st-video__overlay" role="status">
          <p>{emptyMessage}</p>
        </div>
      )}

      {/* Autoplay blocked overlay */}
      {showAutoplayOverlay && (
        <div className="st-video__overlay">
          <p>Trình duyệt đang tắt tiếng tự động</p>
          <button type="button" onClick={handleUnmuteClick} className="st-btn st-btn--light">
            <span>Bật âm thanh trực tiếp</span>
            <span className="st-btn__ic" aria-hidden="true"><Volume2 size={16} /></span>
          </button>
        </div>
      )}

      {overlay}

      {/* Subtitles of the narration: the sentence the voice is reading, over the picture and in full screen. */}
      {captionsOn && caption && (
        <p className="st-video__caption" aria-hidden="true"><span>{caption}</span></p>
      )}

      <div className="st-video__bottom">
        <div className="st-video__ctl">
          <button
            type="button"
            onClick={toggleMute}
            className="st-icon-btn"
            title={audioMuted ? 'Bật tiếng' : 'Tắt tiếng'}
            aria-label={audioMuted ? 'Bật tiếng' : 'Tắt tiếng'}
          >
            {audioMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          {questUrl && !recording && (
            <button
              type="button"
              onClick={() => setLivePaused(!livePaused)}
              className="st-icon-btn"
              title={livePaused ? 'Tiếp tục xem hình' : 'Tạm dừng hình'}
              aria-label={livePaused ? 'Tiếp tục xem hình' : 'Tạm dừng hình'}
            >
              {livePaused ? <Play size={18} /> : <Pause size={18} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCaptionsOn(!captionsOn)}
            className="st-icon-btn"
            aria-pressed={captionsOn}
            title={captionsOn ? 'Tắt phụ đề' : 'Bật phụ đề'}
            aria-label={captionsOn ? 'Tắt phụ đề' : 'Bật phụ đề'}
          >
            {captionsOn ? <Captions size={18} /> : <CaptionsOff size={18} />}
          </button>
          {onReplayNarration && (
            <button type="button" onClick={onReplayNarration} className="st-ghost-btn" title="Nghe lại thuyết minh điểm hiện tại">
              <RotateCcw size={14} />
              <span>Nghe lại thuyết minh</span>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="st-icon-btn"
          title={isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
          aria-label={isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
        >
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import {
  Maximize,
  Minimize,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useStudentStore } from '../student-store'

interface StudentVideoPlayerProps {
  streamUrl?: string
  statusLabel?: string
  onReplayNarration?: () => void
}

export function StudentVideoPlayer({
  streamUrl,
  statusLabel = 'Trực tiếp từ Robot AMR',
  onReplayNarration,
}: StudentVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showAutoplayOverlay, setShowAutoplayOverlay] = useState(false)

  const audioMuted = useStudentStore((s) => s.audioMuted)
  const setAudioMuted = useStudentStore((s) => s.setAudioMuted)
  const isAiSpeaking = useStudentStore((s) => s.isAiSpeaking)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Audio ducking: Giảm volume xuống 0.2 nếu AI đang nói
    video.volume = isAiSpeaking ? 0.2 : 1.0
  }, [isAiSpeaking])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

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
  }, [audioMuted, streamUrl])

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
        src={streamUrl}
        poster="/images/hero-campus.jpg"
        loop
        playsInline
        autoPlay
        muted={audioMuted}
      />

      <div className="st-video__top">
        <div className="st-video__badges">
          <span className="st-badge st-badge--live"><i />Trực tiếp</span>
          <span className="st-badge st-badge--dark">{statusLabel}</span>
        </div>
        {/* Audio ducking indicator if active */}
        {isAiSpeaking && <span className="st-badge st-badge--lime">AI đang trả lời</span>}
      </div>

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

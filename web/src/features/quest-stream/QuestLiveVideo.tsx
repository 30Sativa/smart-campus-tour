import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Maximize2, Minimize2, Pause, Play, RotateCcw, VideoOff } from 'lucide-react'
import { DEV_QUEST_SOURCE, type QuestSource } from './stream-access'
import { usePageVisible } from './use-page-visible'
import { useWhepStream, type LiveStreamStatus } from './use-whep-stream'

const COPY: Record<Exclude<LiveStreamStatus, 'live'>, { title: string; hint: string }> = {
  idle: { title: 'Chưa có quyền xem hình Quest', hint: 'Máy chủ chưa cấp nguồn hình cho trang này.' },
  connecting: { title: 'Đang kết nối nguồn hình…', hint: 'Hình ảnh sẽ xuất hiện khi kính bắt đầu phát.' },
  offline: { title: 'Không có tín hiệu từ kính Quest', hint: 'Chưa nhận được hình từ camera của robot. Kiểm tra kính đang bật, còn lỗi thì báo Kỹ thuật kiểm tra. Đang tự thử lại…' },
  error: { title: 'Trình duyệt không phát được hình trực tiếp (WebRTC)', hint: 'Hãy dùng Chrome, Edge, Firefox hoặc Safari bản mới.' },
}

const BADGE: Record<LiveStreamStatus, { label: string; className: string; dot: string }> = {
  live: { label: 'Trực tiếp', className: 'bg-[#1c1c1c]/60 text-white', dot: 'bg-[#22c55e] animate-pulse' },
  connecting: { label: 'Đang kết nối', className: 'bg-[#fff8e6]/90 text-[#8a5a06]', dot: 'bg-[#f59e0b]' },
  offline: { label: 'Mất tín hiệu', className: 'bg-white/85 text-[#b23e31]', dot: 'bg-[#dc2626]' },
  error: { label: 'Lỗi phát', className: 'bg-white/85 text-[#b23e31]', dot: 'bg-[#dc2626]' },
  idle: { label: 'Chưa cấu hình', className: 'bg-white/85 text-[#475569]', dot: 'bg-[#94a3b8]' },
}

type QuestLiveVideoProps = {
  /** Relay URL and token from the API (ADR-0055). Defaults to the dev-only LAN URL. */
  source?: QuestSource | null
  /** Shown next to the status badge, e.g. the robot's name. */
  label?: string | null
  /** Replaces the "no signal" hint, e.g. while the robot is still switching its camera on. */
  offlineHint?: string
  className?: string
}

/** iOS Safari has no element fullscreen; its <video> can still go fullscreen on its own. */
type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitSupportsFullscreen?: boolean }

const CONTROL = 'inline-flex size-8 items-center justify-center rounded-full bg-[#1c1c1c]/60 text-white backdrop-blur transition-colors hover:bg-[#1c1c1c]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-reduce:transition-none'

const PAUSED_BADGE = { label: 'Tạm dừng', className: 'bg-white/85 text-[#475569]', dot: 'bg-[#94a3b8]' }

/**
 * The Quest 3 camera view as a 16:9 live video. It never shows an old frame
 * as if it were live: without a stream it says why and keeps reconnecting.
 * The viewer can pause it, and a hidden tab stops pulling it; either way the
 * WebRTC connection is closed, so no bandwidth is spent on a picture nobody sees.
 * It can also fill the screen (button, double-click; Esc leaves), keeping the
 * status badge and controls on top of the picture.
 */
export function QuestLiveVideo({ source = DEV_QUEST_SOURCE, label, offlineHint, className = '' }: QuestLiveVideoProps) {
  const frameRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [paused, setPaused] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const visible = usePageVisible()
  const src = source?.whepUrl ?? null
  const { status, retry } = useWhepStream(videoRef, src, !paused && visible, source?.token)
  const badge = paused ? PAUSED_BADGE : BADGE[status]
  const canFullscreen = typeof document !== 'undefined'
    && (document.fullscreenEnabled || typeof (document.createElement('video') as WebkitVideo).webkitEnterFullscreen === 'function')

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === frameRef.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined)
      return
    }
    const frame = frameRef.current
    if (frame?.requestFullscreen && document.fullscreenEnabled) {
      void frame.requestFullscreen().catch(() => undefined)
      return
    }
    const video = videoRef.current as WebkitVideo | null
    if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen()
  }

  return (
    <figure ref={frameRef} className={`relative aspect-video w-full overflow-hidden bg-[#1c1c1c] ${fullscreen ? 'rounded-none' : 'rounded-2xl'} ${className}`}>
      <video
        ref={videoRef}
        className={`size-full ${fullscreen ? 'object-contain' : 'object-cover'} ${status === 'live' ? '' : 'invisible'}`}
        onDoubleClick={canFullscreen ? toggleFullscreen : undefined}
        autoPlay
        muted
        playsInline
        aria-label={`Hình trực tiếp từ kính Quest${label ? ` - ${label}` : ''}`}
      />

      {paused ? (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-[#c6c7cc]" role="status">
          <div>
            <Pause size={28} className="mx-auto text-[#74777d]" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold">Đã tạm dừng hình</p>
            <p className="mt-1 text-xs text-[#8e9096]">Không tải hình trong lúc tạm dừng.</p>
            <button
              type="button"
              onClick={() => setPaused(false)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/20 motion-reduce:transition-none"
            >
              <Play size={14} aria-hidden="true" />
              Tiếp tục xem
            </button>
          </div>
        </div>
      ) : status !== 'live' && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-[#c6c7cc]" role="status">
          <div>
            {status === 'connecting' ? (
              <LoaderCircle size={28} className="mx-auto animate-spin text-[#a9c46a] motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <VideoOff size={28} className="mx-auto text-[#74777d]" aria-hidden="true" />
            )}
            <p className="mt-3 text-sm font-semibold">{COPY[status].title}</p>
            <p className="mt-1 text-xs text-[#8e9096]">{status === 'offline' && offlineHint ? offlineHint : COPY[status].hint}</p>
            {(status === 'offline' || status === 'error') && (
              <button
                type="button"
                onClick={retry}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/20 motion-reduce:transition-none"
              >
                <RotateCcw size={14} aria-hidden="true" />
                Thử lại ngay
              </button>
            )}
          </div>
        </div>
      )}

      <figcaption className="absolute top-3 left-3 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold backdrop-blur ${badge.className}`}>
          <span className={`size-1.5 rounded-full ${badge.dot}`} aria-hidden="true" />
          {badge.label}
        </span>
        {label && <span className="rounded-full bg-[#1c1c1c]/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">{label}</span>}
      </figcaption>

      {src && (
        <div className="absolute right-3 bottom-3 flex items-center gap-2">
          {!paused && (
            <button
              type="button"
              onClick={() => setPaused(true)}
              className={CONTROL}
              title="Tạm dừng hình"
              aria-label="Tạm dừng hình"
            >
              <Pause size={14} aria-hidden="true" />
            </button>
          )}
          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className={CONTROL}
              title={fullscreen ? 'Thu nhỏ (Esc)' : 'Xem toàn màn hình'}
              aria-label={fullscreen ? 'Thoát toàn màn hình' : 'Xem toàn màn hình'}
            >
              {fullscreen ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
            </button>
          )}
        </div>
      )}
    </figure>
  )
}

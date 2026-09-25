import { useRef } from 'react'
import { LoaderCircle, RotateCcw, VideoOff } from 'lucide-react'
import { QUEST_STREAM_URL } from './quest-stream-config'
import { useHlsStream, type HlsStreamStatus } from './use-hls-stream'

const COPY: Record<Exclude<HlsStreamStatus, 'live'>, { title: string; hint: string }> = {
  idle: { title: 'Chưa cấu hình nguồn hình Quest', hint: 'Đặt VITE_QUEST_STREAM_URL rồi khởi động lại web.' },
  connecting: { title: 'Đang kết nối nguồn hình…', hint: 'Hình ảnh sẽ xuất hiện khi kính bắt đầu phát.' },
  offline: { title: 'Không có tín hiệu từ kính Quest', hint: 'Kiểm tra cáp USB, kính đang bật và dịch vụ quest-stream trên miniPC. Đang tự thử lại…' },
  error: { title: 'Trình duyệt không phát được luồng trực tiếp', hint: 'Hãy dùng Chrome, Edge, Firefox hoặc Safari bản mới.' },
}

const BADGE: Record<HlsStreamStatus, { label: string; className: string; dot: string }> = {
  live: { label: 'Trực tiếp', className: 'bg-[#1c1c1c]/60 text-white', dot: 'bg-[#22c55e] animate-pulse' },
  connecting: { label: 'Đang kết nối', className: 'bg-[#fff8e6]/90 text-[#8a5a06]', dot: 'bg-[#f59e0b]' },
  offline: { label: 'Mất tín hiệu', className: 'bg-white/85 text-[#b23e31]', dot: 'bg-[#dc2626]' },
  error: { label: 'Lỗi phát', className: 'bg-white/85 text-[#b23e31]', dot: 'bg-[#dc2626]' },
  idle: { label: 'Chưa cấu hình', className: 'bg-white/85 text-[#475569]', dot: 'bg-[#94a3b8]' },
}

type QuestLiveVideoProps = {
  /** HLS playlist URL. Defaults to VITE_QUEST_STREAM_URL. */
  src?: string | null
  /** Shown next to the status badge, e.g. the robot's name. */
  label?: string | null
  className?: string
}

/**
 * The Quest 3 camera view as a 16:9 live video. It never shows an old frame
 * as if it were live: without a stream it says why and keeps reconnecting.
 */
export function QuestLiveVideo({ src = QUEST_STREAM_URL, label, className = '' }: QuestLiveVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { status, retry } = useHlsStream(videoRef, src)
  const badge = BADGE[status]

  return (
    <figure className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-[#1c1c1c] ${className}`}>
      <video
        ref={videoRef}
        className={`size-full object-cover ${status === 'live' ? '' : 'invisible'}`}
        autoPlay
        muted
        playsInline
        aria-label={`Hình trực tiếp từ kính Quest${label ? ` - ${label}` : ''}`}
      />

      {status !== 'live' && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-[#c6c7cc]" role="status">
          <div>
            {status === 'connecting' ? (
              <LoaderCircle size={28} className="mx-auto animate-spin text-[#a9c46a] motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <VideoOff size={28} className="mx-auto text-[#74777d]" aria-hidden="true" />
            )}
            <p className="mt-3 text-sm font-semibold">{COPY[status].title}</p>
            <p className="mt-1 text-xs text-[#8e9096]">{COPY[status].hint}</p>
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
    </figure>
  )
}

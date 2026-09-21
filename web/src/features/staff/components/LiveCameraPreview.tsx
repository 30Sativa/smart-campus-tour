import { LoaderCircle, VideoOff } from 'lucide-react'
import type { Livestream } from '../../../api/contracts/staff'
import { LiveDot } from '../StaffUi'
import { statusLabel } from '../status'

/**
 * The robot's camera as the group's livestream will show it. Three honest
 * states: a picture, "connecting", or nothing - never a still frame posing as
 * a live one.
 */
export function LiveCameraPreview({ livestream, robotName, className = '' }: { livestream: Livestream; robotName?: string | null; className?: string }) {
  const live = livestream.state === 'Live' && livestream.url
  return (
    <figure className={`relative aspect-video overflow-hidden rounded-2xl bg-[#101c2e] ${className}`}>
      {live ? (
        <video key={livestream.url} src={livestream.url ?? undefined} className="size-full object-cover" autoPlay muted loop playsInline aria-label={`Camera ${robotName ?? 'robot'}`} />
      ) : (
        <div className="grid size-full place-items-center text-center text-[#c6d3e6]">
          <div>
            {livestream.state === 'Connecting' ? <LoaderCircle size={28} className="mx-auto animate-spin text-[#8fb4f2]" aria-hidden="true" /> : <VideoOff size={28} className="mx-auto text-[#71819a]" aria-hidden="true" />}
            <p className="mt-3 text-sm font-semibold">{livestream.state === 'Connecting' ? 'Đang kết nối nguồn hình…' : 'Không có tín hiệu nguồn hình'}</p>
            <p className="mt-1 text-xs text-[#8a98ac]">{livestream.state === 'Connecting' ? 'Hình ảnh sẽ xuất hiện khi nguồn bắt đầu phát.' : 'Kiểm tra nguồn hình trên đầu xoay (Quest/camera) và đường phân phối video.'}</p>
          </div>
        </div>
      )}
      <figcaption className="absolute top-3 left-3 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold backdrop-blur ${live ? 'bg-[#101c2e]/60 text-white' : livestream.state === 'Connecting' ? 'bg-[#fff8e6]/90 text-[#8a5a06]' : 'bg-white/85 text-[#b23e31]'}`}>
          <LiveDot tone={live ? 'ok' : livestream.state === 'Connecting' ? 'warn' : 'danger'} pulse={Boolean(live)} />
          {live ? 'Trực tiếp' : statusLabel(livestream.state)}
        </span>
        {robotName && <span className="rounded-full bg-[#101c2e]/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">{robotName}</span>}
      </figcaption>
    </figure>
  )
}

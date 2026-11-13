import { QuestLiveVideo } from '../../../quest-stream/QuestLiveVideo'
import { useCameraLease, type RobotCameraStatus } from '../../../quest-stream/camera-lease'
import { DEV_QUEST_SOURCE, toQuestSource } from '../../../quest-stream/stream-access'

/** What the camera says while it has no picture, in words an operator can act on. */
function liveCameraHint(status: RobotCameraStatus | undefined, failed: boolean): string | undefined {
  if (failed) return 'Không xin được quyền xem camera từ máy chủ. Đang thử lại…'
  if (!status) return undefined
  if (!status.robotListening) return 'Robot chưa bật được camera từ xa. Báo Kỹ thuật kiểm tra robot và mạng của robot.'
  return 'Đang bật camera trên robot. Hình sẽ lên sau khoảng 30 giây.'
}

/**
 * The robot's camera on the live console, watched with the Staff permission the
 * pre-start check uses: the camera lease brings this user's relay URL and
 * token (ADR-0052, ADR-0055), renewed while the page is open.
 */
export function LiveCamera({ robotCode }: { robotCode: string | null | undefined }) {
  const lease = useCameraLease(robotCode)
  const source = (lease.isError ? null : toQuestSource(lease.data?.stream)) ?? DEV_QUEST_SOURCE
  if (!robotCode) return <p className="p-4 text-[13px] text-muted">Tour chưa giữ robot nào.</p>
  if (!source) return <div className="grid aspect-video w-full place-items-center rounded-2xl bg-[#1c1c1c] p-4 text-center text-[13px] leading-5 text-[#c6c7cc]" role="status">
    {lease.isPending ? 'Đang xin quyền xem camera…' : lease.isError ? liveCameraHint(undefined, true) : 'Máy chủ chưa cấp hình camera cho robot này.'}
  </div>
  return <QuestLiveVideo source={source} label={robotCode} offlineHint={liveCameraHint(lease.data, lease.isError) ?? 'Chưa có hình từ camera của robot. Đang tự thử lại…'} />
}

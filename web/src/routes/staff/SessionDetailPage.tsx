import { useState } from 'react'
import { Bot, History, Radio } from 'lucide-react'
import { useParams } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { hasOperationalRole } from '../../auth/roles'
import { useRemoteMutation, useRemoteWorkspace } from '../../features/remote-tour/remote-hooks'
import { remotePreviewApi } from '../../mocks/remote-tour-mock'
import { Badge, buttonClass, Confirmation, Panel } from '../../features/remote-tour/RemoteUi'
import { TourActions } from '../../features/remote-tour/TourActions'
import { ErrorPanel, LoadingPanel, PageHeader, panelClass } from '../../features/staff/StaffUi'
import { formatDateTime } from '../../features/staff/formatters'

export default function SessionDetailPage() {
  const { sessionId } = useParams()
  const query = useRemoteWorkspace()
  const canOperate = hasOperationalRole(useAuthStore(s => s.user?.role))
  const [releaseOpen, setReleaseOpen] = useState(false)
  const release = useRemoteMutation(() => remotePreviewApi.releaseRobot(true))
  const fault = useRemoteMutation((kind: 'fault' | 'restart' | 'return-stream') => remotePreviewApi.simulateFault(sessionId ?? '', kind))
  if (query.isPending) return <LoadingPanel />
  if (!query.data) return <ErrorPanel error={query.error} onRetry={query.refetch} />
  const w = query.data
  const tour = w.tours.find(t => t.id === sessionId)
  if (!tour) return <Panel title="Không tìm thấy buổi"><p>Quay lại lịch tour để chọn buổi tham quan.</p></Panel>
  const robot = w.robots.find(r => r.assignedTourId === tour.id) ?? w.robots[0]
  const route = w.routes.find(r => r.id === tour.routeId)
  const groups = w.registrations.filter(r => r.tourId === tour.id && r.state === 'APPROVED')
  const needsRelease = robot?.needsInspection && robot.assignedTourId === tour.id
  return <div className="min-h-full bg-[#eef2f8] px-4 py-5 sm:px-6 lg:px-8 lg:py-7"><div className="mx-auto w-full max-w-[1500px]">
    <PageHeader eyebrow="Vận hành tour" title={tour.name} description={`${formatDateTime(tour.scheduledAt)} · ${route?.name ?? ''}`} />
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <div className="space-y-5">
        <Panel title="Thông tin phiên tour"><div className="grid gap-3 text-sm"><div className="flex justify-between"><span>Trạng thái phiên</span><Badge value={tour.state} /></div><div className="flex justify-between"><span>Đoàn tham gia</span><strong>{groups.length} đoàn · {groups.reduce((n, r) => n + r.roster.length, 0)} học sinh</strong></div><div className="flex justify-between"><span>AMR hiện tại</span><strong>{w.robots.find(r => r.assignedTourId === tour.id)?.id ?? 'Chưa bắt đầu'}</strong></div>{tour.state === 'RUNNING' && <div className="flex flex-wrap justify-between gap-2"><span>Bước hiện tại</span><Badge value={tour.step} /><Badge value={tour.operation} />{tour.hold && <span>Đang giữ tại điểm</span>}</div>}</div></Panel>
        <section className={panelClass}><div className="flex items-center gap-2 border-b border-[#edf2fa] px-5 py-4 text-[#40546f]"><Bot size={16} /><h2 className="font-bold">Điều phối AMR</h2></div><div className="space-y-3 p-5 text-sm text-[#647793]"><p>READY chốt nội dung và danh sách. Staff kiểm tra điều kiện robot trước khi bắt đầu.</p>{robot && <dl className="grid grid-cols-2 gap-3"><dt>Robot / nguồn dữ liệu</dt><dd>{robot.id} · {robot.source} (mẫu)</dd><dt>Kết nối</dt><dd>{robot.connected ? 'Trực tuyến' : 'Mất kết nối'}</dd><dt>Nguồn</dt><dd>{robot.powerReady ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</dd><dt>Định vị</dt><dd>{robot.localized ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</dd><dt>Camera phía trước</dt><dd>{robot.front ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</dd><dt>Nguồn hình mô phỏng</dt><dd>{robot.streamReady ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</dd></dl>}<p>Không đổi robot giữa buổi. Video và robot thật chưa kết nối.</p>{needsRelease && <><p role="status">Robot vẫn được giữ sau khi kết thúc sớm. Cần kiểm tra đã dừng trước khi giải phóng.</p>{canOperate && <button className={buttonClass} onClick={() => setReleaseOpen(true)}>Xác nhận robot đã dừng</button>}</>}</div></section>
        <section className={panelClass}><div className="flex items-center gap-2 border-b border-[#edf2fa] px-5 py-4 text-[#40546f]"><Radio size={16} /><h2 className="font-bold">Điều khiển buổi tham quan</h2></div><div className="space-y-4 p-5 text-sm text-[#647793]">{canOperate ? <TourActions tour={tour} options={w.actions[tour.id] ?? []} /> : <p>Chỉ xem giám sát. Thao tác robot cần quyền Staff.</p>}{tour.state === 'RUNNING' && <p>Hold chỉ giữ khi đã dừng tại điểm. Next đưa camera về phía trước trước khi đi tiếp. Buổi hoàn thành sau khi robot về điểm kết thúc và xác nhận dừng.</p>}{tour.state === 'SCHEDULED' && <p>Chờ Admin duyệt đoàn và chốt buổi.</p>}{tour.endReason && <p>Lý do kết thúc: {tour.endReason}</p>}{['COMPLETED','CANCELLED'].includes(tour.state) && <p>Buổi đã kết thúc. Không còn thao tác dẫn tour.</p>}
        {import.meta.env.DEV && canOperate && tour.state === 'RUNNING' && <details><summary className="cursor-pointer">Công cụ thử tình huống mock</summary><div className="mt-3 flex flex-wrap gap-2"><button className={buttonClass} disabled={fault.isPending} onClick={() => fault.mutate('fault')}>Mô phỏng sự cố</button><button className={buttonClass} disabled={fault.isPending} onClick={() => fault.mutate('restart')}>Mô phỏng restart</button><button className={buttonClass} disabled={fault.isPending} onClick={() => fault.mutate('return-stream')}>Đã về, lỗi nguồn hình</button></div>{fault.isError && <p role="alert">Không thể mô phỏng. Hãy tải lại trạng thái.</p>}</details>}</div></section>
      </div>
      <div className="space-y-5"><section className={panelClass}><div className="flex items-center gap-2 border-b border-[#edf2fa] px-5 py-4 text-[#40546f]"><History size={16} /><h2 className="font-bold">Dòng thời gian</h2></div><ul className="divide-y divide-[#edf2fa]">{tour.log.map((line, i) => <li key={i} className="px-5 py-4 text-sm text-[#71819a]">{line}</li>)}</ul></section>
        <Panel title="Cảnh báo liên quan"><p role="status">{tour.operation === 'NEEDS_ASSISTANCE' && tour.state === 'RUNNING' ? tour.fault === 'restart' ? 'Phiên bị gián đoạn. Chỉ có thể kết thúc sớm và kiểm tra robot.' : 'Cần hỗ trợ. Chọn thao tác thử lại đúng bước đang lỗi.' : 'Không có cảnh báo đang cần xử lý.'}</p></Panel>
        <Panel title="Đoàn đã duyệt"><div className="space-y-3">{groups.map(r => <details key={r.id}><summary className="cursor-pointer font-semibold">{r.school} · {r.roster.length} học sinh</summary><ul className="mt-2 text-sm">{r.roster.map((row,i) => <li key={i}>{row.name} · {row.className}</li>)}</ul></details>)}</div></Panel>
      </div>
    </section>
    <Confirmation title="Giải phóng robot sau kiểm tra" open={releaseOpen} pending={release.isPending} error={release.error} onClose={() => setReleaseOpen(false)} onConfirm={() => release.mutate(undefined, { onSuccess: () => setReleaseOpen(false) })}><p>Xác nhận robot đã dừng và được kiểm tra. Đây chỉ là bằng chứng mô phỏng trong bản demo.</p></Confirmation>
  </div></div>
}

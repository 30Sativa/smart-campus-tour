import { useState, type FormEvent } from 'react'
import { Bot, KeyRound, LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import { PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { Modal } from '../../components/ui/Drawer'
import { buttonClass, inputClass, labelClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { usePhysicalRobots, useRegisterPhysicalRobot } from '../../features/technical/technical-hooks'
import { errorText, stamp } from '../../features/technical/technical-format'
import { RobotCredentialPanel } from './RobotCredentialPanel'

const connectionStatus = {
  UNCONFIRMED: { label: 'Chưa xác nhận kết nối', tone: 'warn' as const },
  CONNECTED: { label: 'Đã xác nhận · Đang kết nối', tone: 'ok' as const },
  DISCONNECTED: { label: 'Đã xác nhận · Mất kết nối', tone: 'danger' as const },
  AWAITING_DATA: { label: 'Đã xác nhận · Chưa nhận dữ liệu từ lần khởi động này', tone: 'warn' as const },
}

export default function TechnicalRobotsPage() {
  const robots = usePhysicalRobots()
  const [registering, setRegistering] = useState(false)
  const [credentialRobotCode, setCredentialRobotCode] = useState<string | null>(null)

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Robot" title="Robot vật lý" description="Robot đã đăng ký sẽ xuất hiện khi ghi kết quả kiểm tra bản đồ. Kết nối ROS 2 được thiết lập riêng trên robot."
        action={<button type="button" className={buttonClass('primary')} onClick={() => setRegistering(true)}><Plus size={15} aria-hidden="true" />Đăng ký robot</button>} />
      <section className={panelClass} aria-label="Danh sách robot vật lý">
        <PanelHead title="Robot đã đăng ký" action={!robots.isPending && !robots.isError ? <button type="button" className={buttonClass('secondary', 'sm')} disabled={robots.isFetching} onClick={() => void robots.refetch()}><RefreshCw size={13} aria-hidden="true" />{robots.isFetching ? 'Đang cập nhật…' : 'Cập nhật trạng thái'}</button> : undefined} />
        {robots.isPending ? <p className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] font-semibold text-[#64748b]" role="status" aria-busy="true"><LoaderCircle size={16} className="animate-spin text-[#2d719e]" aria-hidden="true" />Đang tải danh sách robot…</p> : robots.isError ? <div role="alert" className="space-y-2 p-4 text-[13px] text-[#b23e31]"><p>{errorText(robots.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void robots.refetch()}>Tải lại danh sách robot</button></div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left">
            <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>Robot</th><th className={thClass}>Kết nối</th><th className={thClass}>Bản đồ</th><th className={thClass}><span className="sr-only">Thao tác</span></th></tr></thead>
            <tbody className="divide-y divide-[#eef1f4]">
              {robots.data?.map(robot => {
                const status = connectionStatus[robot.connectionStatus] ?? connectionStatus.UNCONFIRMED
                const configured = Boolean(robot.configuredMapKey && robot.configuredFrameId)
                const hasLatestDeployment = Boolean(robot.latestDeployedMapKey && robot.latestDeployedFrameId)
                const contextMismatch = configured && hasLatestDeployment &&
                  (robot.configuredMapKey !== robot.latestDeployedMapKey || robot.configuredFrameId !== robot.latestDeployedFrameId)
                return <tr key={robot.id} className="align-top">
                  <td className={tdClass}><p className="font-semibold text-[#0f172a]">{robot.displayName || '—'}</p><p className="font-mono text-xs text-[#64748b]">{robot.robotCode}</p></td>
                  <td className={tdClass}>
                    <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
                    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs text-[#64748b]">
                      <dt>Dữ liệu gần nhất</dt><dd className="text-[#334155]">{stamp(robot.lastSyncReceivedAt)}</dd>
                      <dt>Kết nối lần đầu</dt><dd className="text-[#334155]">{stamp(robot.firstAcceptedSyncAt)}{robot.firstAcceptedMapKey && robot.firstAcceptedFrameId && <span className="ml-1.5 font-mono text-[#64748b]">{robot.firstAcceptedMapKey} · {robot.firstAcceptedFrameId}</span>}</dd>
                    </dl>
                  </td>
                  <td className={`${tdClass} text-xs`}>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                      <dt className="text-[#64748b]">Trên robot</dt>
                      <dd>{hasLatestDeployment ? <span className="font-mono text-[#334155]">{robot.latestDeployedMapKey} · {robot.latestDeployedFrameId}</span> : <span className="text-[#64748b]">Chưa ghi nhận kiểm tra</span>}</dd>
                      <dt className="text-[#64748b]">Máy chủ</dt>
                      <dd>{configured ? <span className="font-mono text-[#334155]">{robot.configuredMapKey} · {robot.configuredFrameId}</span> : <span className="font-semibold text-amber-800">Chưa thiết lập</span>}</dd>
                    </dl>
                    {!configured && <p className="mt-1.5 max-w-xs text-[#64748b]">Máy chủ chưa biết robot này dùng bản đồ nào nên chưa hiển thị được vị trí. Cần khai báo trong cấu hình máy chủ (FleetSync:RobotContexts).</p>}
                    {contextMismatch && <p className="mt-1.5 max-w-xs rounded-md bg-amber-50 px-2 py-1 text-amber-800">Bản đồ trên robot khác với máy chủ. Cập nhật FleetSync:RobotContexts sang {robot.latestDeployedMapKey} · {robot.latestDeployedFrameId} rồi khởi động lại máy chủ.</p>}
                  </td>
                  <td className={`${tdClass} text-right`}><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setCredentialRobotCode(robot.robotCode)}><KeyRound size={13} aria-hidden="true" />Khóa kết nối</button></td>
                </tr>
              })}
              {!robots.data?.length && <tr><td className={`${tdClass} py-8 text-center text-[#64748b]`} colSpan={4}><Bot size={20} className="mx-auto mb-2 text-[#94a3b8]" aria-hidden="true" />Chưa có robot vật lý được đăng ký.</td></tr>}
            </tbody>
          </table></div>
        )}
      </section>
      <RegisterRobotModal open={registering} onClose={() => setRegistering(false)} />
      {credentialRobotCode && <RobotCredentialPanel robotCode={credentialRobotCode} onClose={() => setCredentialRobotCode(null)} />}
    </TechnicalPage>
  )
}

function RegisterRobotModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const register = useRegisterPhysicalRobot()
  const [robotCode, setRobotCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const close = () => {
    if (register.isPending) return
    register.reset()
    setRobotCode('')
    setDisplayName('')
    onClose()
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (register.isPending) return
    register.mutate({ robotCode: robotCode.trim(), displayName: displayName.trim() }, { onSuccess: () => {
      setRobotCode('')
      setDisplayName('')
      onClose()
    } })
  }

  return <Modal open={open} title="Đăng ký robot" description="Tạo danh tính robot vật lý trong hệ thống." onClose={close}
    footer={<div className="flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={close}>Hủy</button><button type="submit" form="physical-robot-form" className={buttonClass('primary')} disabled={register.isPending || !robotCode.trim() || !displayName.trim()}>{register.isPending ? 'Đang đăng ký…' : 'Đăng ký robot'}</button></div>}>
    <form id="physical-robot-form" className="space-y-3.5" onSubmit={submit}>
      <div><label className={labelClass} htmlFor="physical-robot-code">Mã robot</label><input id="physical-robot-code" className={`${inputClass} mt-1`} required maxLength={100} pattern={'[A-Za-z0-9][A-Za-z0-9_.\\-]{0,99}'} disabled={register.isPending} value={robotCode} onBlur={() => setRobotCode(value => value.trim())} onChange={event => { setRobotCode(event.target.value); if (!register.isPending) register.reset() }} placeholder="amr-01" /><p className="mt-1 text-xs text-[#64748b]">Tối đa 100 ký tự; bắt đầu bằng chữ hoặc số, chỉ dùng chữ, số, dấu chấm, gạch dưới hoặc gạch nối.</p></div>
      <div><label className={labelClass} htmlFor="physical-robot-name">Tên robot</label><input id="physical-robot-name" className={`${inputClass} mt-1`} required maxLength={150} disabled={register.isPending} value={displayName} onChange={event => { setDisplayName(event.target.value); if (!register.isPending) register.reset() }} placeholder="AMR 01" /></div>
      {register.error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errorText(register.error)}</p>}
      <p className="text-[12.5px] leading-5 text-[#64748b]">Đăng ký tạo danh tính robot trong hệ thống. Thiết lập kết nối ROS 2 được thực hiện riêng trên robot.</p>
    </form>
  </Modal>
}

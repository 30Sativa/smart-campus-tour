import { useState, type FormEvent } from 'react'
import { Bot, LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import { PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { Drawer } from '../../components/ui/Drawer'
import { buttonClass, inputClass, labelClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { usePhysicalRobots, useRegisterPhysicalRobot } from '../../features/technical/technical-hooks'
import { errorText, stamp } from '../../features/technical/technical-format'
import { RobotCredentialPanel } from './RobotCredentialPanel'

const connectionStatus = {
  UNCONFIRMED: { label: 'Chưa xác nhận kết nối', tone: 'warn' as const },
  CONNECTED: { label: 'Đã xác nhận · Đang kết nối', tone: 'ok' as const },
  DISCONNECTED: { label: 'Đã xác nhận · Mất kết nối', tone: 'danger' as const },
  AWAITING_DATA: { label: 'Đã xác nhận · Chưa nhận dữ liệu sau khi hệ thống khởi động', tone: 'warn' as const },
}

export default function TechnicalRobotsPage() {
  const robots = usePhysicalRobots()
  const [registering, setRegistering] = useState(false)
  const [credentialRobotCode, setCredentialRobotCode] = useState<string | null>(null)

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Robot" title="Robot vật lý" description="Quản lý danh tính robot để chọn khi ghi kết quả kiểm tra map."
        action={<button type="button" className={buttonClass('primary')} onClick={() => setRegistering(true)}><Plus size={15} aria-hidden="true" />Đăng ký robot</button>} />
      <p className="mb-3 rounded-lg border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-[13px] leading-5 text-[#334155]">Đăng ký tạo danh tính robot trong hệ thống. Thiết lập kết nối ROS2 được thực hiện riêng.</p>
      <section className={panelClass} aria-label="Danh sách robot vật lý">
        <PanelHead title="Robot đã đăng ký" description="Robot xuất hiện trong danh sách chọn khi ghi kết quả kiểm tra map." />
        {robots.isPending ? <p className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] font-semibold text-[#64748b]" role="status" aria-busy="true"><LoaderCircle size={16} className="animate-spin text-[#2d719e]" aria-hidden="true" />Đang tải danh sách robot…</p> : robots.isError ? <div role="alert" className="space-y-2 p-4 text-[13px] text-[#b23e31]"><p>{errorText(robots.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void robots.refetch()}>Tải lại danh sách robot</button></div> : (
          <><div className="flex justify-end px-4 pt-3"><button type="button" className={buttonClass('secondary', 'sm')} disabled={robots.isFetching} onClick={() => void robots.refetch()}><RefreshCw size={13} aria-hidden="true" />{robots.isFetching ? 'Đang cập nhật…' : 'Cập nhật trạng thái'}</button></div><div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left">
            <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>Mã robot</th><th className={thClass}>Tên robot</th><th className={thClass}>Kết nối</th><th className={thClass}>Xác nhận đầu tiên</th><th className={thClass}>Map / frame xác nhận</th><th className={thClass}>Cấu hình BE</th><th className={thClass}>Triển khai gần nhất</th><th className={thClass}>Nhận dữ liệu gần nhất</th><th className={thClass}>Khóa</th></tr></thead>
            <tbody className="divide-y divide-[#eef1f4]">
              {robots.data?.map(robot => {
                const status = connectionStatus[robot.connectionStatus] ?? connectionStatus.UNCONFIRMED
                const configured = Boolean(robot.configuredMapKey && robot.configuredFrameId)
                const hasLatestDeployment = Boolean(robot.latestDeployedMapKey && robot.latestDeployedFrameId)
                const contextMismatch = configured && hasLatestDeployment &&
                  (robot.configuredMapKey !== robot.latestDeployedMapKey || robot.configuredFrameId !== robot.latestDeployedFrameId)
                return <tr key={robot.id}>
                  <td className={`${tdClass} font-mono`}>{robot.robotCode}</td>
                  <td className={tdClass}>{robot.displayName || '—'}</td>
                  <td className={tdClass}><ToneBadge tone={status.tone}>{status.label}</ToneBadge></td>
                  <td className={tdClass}>{stamp(robot.firstAcceptedSyncAt)}</td>
                  <td className={`${tdClass} font-mono text-xs`}>{robot.firstAcceptedMapKey && robot.firstAcceptedFrameId ? `${robot.firstAcceptedMapKey} · ${robot.firstAcceptedFrameId}` : '—'}</td>
                  <td className={`${tdClass} text-xs`}>{configured ? <span className="font-mono">{robot.configuredMapKey} · {robot.configuredFrameId}</span> : <span className="text-amber-800">BE chưa cấu hình ngữ cảnh map cho robot này</span>}</td>
                  <td className={`${tdClass} text-xs`}>{hasLatestDeployment ? <><span className="font-mono">{robot.latestDeployedMapKey} · {robot.latestDeployedFrameId}</span>{contextMismatch && <p className="mt-1 max-w-xs text-amber-800">Cấu hình BE đang dùng map {robot.configuredMapKey} · {robot.configuredFrameId} nhưng robot được triển khai map {robot.latestDeployedMapKey} · {robot.latestDeployedFrameId} gần nhất. Cập nhật FleetSync:RobotContexts và khởi động lại BE.</p>}</> : <span className="text-[#64748b]">Chưa ghi nhận</span>}</td>
                  <td className={tdClass}>{stamp(robot.lastSyncReceivedAt)}</td>
                  <td className={tdClass}><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setCredentialRobotCode(robot.robotCode)}>Quản lý khóa</button></td>
                </tr>
              })}
              {!robots.data?.length && <tr><td className={`${tdClass} py-8 text-center text-[#64748b]`} colSpan={9}><Bot size={20} className="mx-auto mb-2 text-[#94a3b8]" aria-hidden="true" />Chưa có robot vật lý được đăng ký.</td></tr>}
            </tbody>
          </table></div></>
        )}
      </section>
      <RegisterRobotDrawer open={registering} onClose={() => setRegistering(false)} />
      {credentialRobotCode && <RobotCredentialPanel robotCode={credentialRobotCode} onClose={() => setCredentialRobotCode(null)} />}
    </TechnicalPage>
  )
}

function RegisterRobotDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
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

  return <Drawer open={open} title="Đăng ký robot" description="Tạo danh tính robot vật lý trong hệ thống." onClose={close}
    footer={<div className="flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={close}>Hủy</button><button type="submit" form="physical-robot-form" className={buttonClass('primary')} disabled={register.isPending || !robotCode.trim() || !displayName.trim()}>{register.isPending ? 'Đang đăng ký…' : 'Đăng ký robot'}</button></div>}>
    <form id="physical-robot-form" className="space-y-3.5" onSubmit={submit}>
      <div><label className={labelClass} htmlFor="physical-robot-code">Mã robot</label><input id="physical-robot-code" className={`${inputClass} mt-1`} required maxLength={100} pattern={'[A-Za-z0-9][A-Za-z0-9_.\\-]{0,99}'} disabled={register.isPending} value={robotCode} onBlur={() => setRobotCode(value => value.trim())} onChange={event => { setRobotCode(event.target.value); if (!register.isPending) register.reset() }} placeholder="amr-01" /><p className="mt-1 text-xs text-[#64748b]">Tối đa 100 ký tự; bắt đầu bằng chữ hoặc số, chỉ dùng chữ, số, dấu chấm, gạch dưới hoặc gạch nối.</p></div>
      <div><label className={labelClass} htmlFor="physical-robot-name">Tên robot</label><input id="physical-robot-name" className={`${inputClass} mt-1`} required maxLength={150} disabled={register.isPending} value={displayName} onChange={event => { setDisplayName(event.target.value); if (!register.isPending) register.reset() }} placeholder="AMR 01" /></div>
      {register.error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errorText(register.error)}</p>}
      <p className="text-[12.5px] leading-5 text-[#64748b]">Đăng ký tạo danh tính robot trong hệ thống. Thiết lập kết nối ROS2 được thực hiện riêng.</p>
    </form>
  </Drawer>
}

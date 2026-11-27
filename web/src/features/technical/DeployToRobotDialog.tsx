import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Modal } from '../../components/ui/Drawer'
import { buttonClass, inputClass, labelClass } from '../../components/ui/ui-classes'
import { useMapShortLabel, usePhysicalRobots } from './technical-hooks'
import { errorText, mapText } from './technical-format'
import { robotSetupPath } from './robot-readiness'

/**
 * "Gán cho robot…": choose the robot, then continue in that robot's setup dialog with this version chosen.
 * Assigning and the deployment check happen there, so the robot keeps one place where its map is changed.
 */
export function DeployToRobotDialog({ mapVersionId, mapLabel, preselectRobotId, returnTo, onClose }: {
  mapVersionId: string; mapLabel: string
  /** The robot already holding this area, if any: an area holds one robot, so it is the usual choice. */
  preselectRobotId?: string
  /** Opened from a POI check or route test: the robot page offers to go back there. */
  returnTo?: string
  /** Hủy, Escape or the close button. A form that opened this reopens itself, so its context is not lost. */
  onClose: () => void
}) {
  const robots = usePhysicalRobots()
  const mapLabelOf = useMapShortLabel()
  const navigate = useNavigate()
  const [robotId, setRobotId] = useState(preselectRobotId ?? '')
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (robotId) navigate(robotSetupPath(robotId, mapVersionId, returnTo))
  }
  return (
    <Modal open title={mapText.pickerTitle(mapLabel)} description={mapText.pickerDescription} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={onClose}>Hủy</button><button type="submit" form="deploy-to-robot-form" className={buttonClass('primary')} disabled={!robotId}>Tiếp tục</button></div>}>
      <form id="deploy-to-robot-form" onSubmit={submit}>
        <label className={labelClass} htmlFor="deploy-robot">Robot</label>
        <select title="" id="deploy-robot" className={`${inputClass} mt-1`} required value={robotId} disabled={robots.isPending || robots.isError} onChange={event => setRobotId(event.target.value)}>
          <option value="">Chọn robot</option>
          {robots.data?.map(robot => <option key={robot.id} value={robot.id}>{robot.displayName ? `${robot.displayName} · ` : ''}{robot.robotCode}{robot.assignedAreaName ? ` · đang gán ${mapLabelOf(robot.assignedMapVersionId) ?? `${robot.assignedAreaName} · v${robot.assignedVersionNumber}`}` : ' · chưa gán bản đồ'}</option>)}
        </select>
        {robots.isPending && <p role="status" className="mt-1 text-sm text-[#64748b]">Đang tải danh sách robot…</p>}
        {robots.isError && <div role="alert" className="mt-1 text-sm text-[#b23e18]"><p>{errorText(robots.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void robots.refetch()}>Tải lại danh sách robot</button></div>}
        {robots.data?.length === 0 && <p role="status" className="mt-1 text-sm text-[#b23e18]">Chưa có robot vật lý được đăng ký.</p>}
      </form>
    </Modal>
  )
}

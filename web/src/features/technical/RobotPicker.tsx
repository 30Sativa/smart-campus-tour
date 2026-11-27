import type { UseQueryResult } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { buttonClass, inputClass, labelClass } from '../../components/ui/ui-classes'
import type { PhysicalRobotOption } from './api/technical'
import { poiImportText } from './poi-labels'
import { errorText } from './technical-format'


/**
 * The registered-robot dropdown, with its loading, failed and empty states. Given `mapVersionId`, the robot the
 * server calls ready on that version comes first and the others say they are not, so nobody has to pick one to
 * learn it. Picking one that is not ready is allowed; the caller says what that means.
 */
export function RobotPicker({ id, label, value, onChange, robots, emptyText, mapVersionId }: {
  id: string; label: string; value: string; onChange: (robotCode: string) => void
  robots: UseQueryResult<PhysicalRobotOption[]>; emptyText: string; mapVersionId?: string
}) {
  const readyHere = (robot: PhysicalRobotOption) => robot.readiness?.state === 'READY' && robot.readiness.mapVersionId === mapVersionId
  const options = mapVersionId ? [...(robots.data ?? [])].sort((a, b) => Number(readyHere(b)) - Number(readyHere(a))) : robots.data
  return (
    <>
      <div className="flex items-end justify-between gap-2"><label className={labelClass} htmlFor={id}>{label}</label>{!robots.isPending && !robots.isError && <button type="button" className={buttonClass('secondary', 'sm')} disabled={robots.isFetching} onClick={() => void robots.refetch()}><RefreshCw size={13} aria-hidden="true" />{robots.isFetching ? 'Đang cập nhật…' : 'Cập nhật trạng thái'}</button>}</div>
      <select title="" id={id} className={`${inputClass} mt-1`} required value={value} disabled={robots.isPending || robots.isError || !robots.data?.length} onChange={event => onChange(event.target.value)}><option value="">Chọn robot vật lý</option>{options?.map(robot => <option key={robot.id} value={robot.robotCode}>{poiImportText.robotOption(robot, mapVersionId ? readyHere(robot) : null)}</option>)}</select>
      {robots.isPending && <p role="status" className="mt-1 text-sm text-[#64748b]">Đang tải danh sách robot…</p>}
      {robots.isError && <div role="alert" className="mt-1 text-sm text-[#b23e18]"><p>{errorText(robots.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void robots.refetch()}>Tải lại danh sách robot</button></div>}
      {!robots.isPending && !robots.isError && robots.data?.length === 0 && <div role="status" className="mt-1 text-sm text-[#b23e18]"><p>{emptyText}</p><Link className="mt-1 inline-block font-semibold text-[#1d4ed8] underline" to="/technical/robots">Đăng ký robot</Link></div>}
    </>
  )
}

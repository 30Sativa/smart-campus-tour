import type { UseQueryResult } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { buttonClass, inputClass, labelClass } from '../../components/ui/ui-classes'
import type { PhysicalRobotOption } from './api/technical'
import { connectionStatusLabel, errorText } from './technical-format'

/** A robot is ready for a map when its latest deployment check passed on that exact map. The server rechecks on save. */
const readyOn = (robot: PhysicalRobotOption, mapKey: string) => robot.latestDeploymentPassed === true && robot.latestDeployedMapKey === mapKey

/**
 * The registered-robot dropdown, with its loading, failed and empty states. Given `mapKey`, robots ready on
 * that map come first and the others say why, so nobody has to pick one to learn it cannot be used.
 */
export function RobotPicker({ id, label, value, onChange, robots, emptyText, mapKey }: {
  id: string; label: string; value: string; onChange: (robotCode: string) => void
  robots: UseQueryResult<PhysicalRobotOption[]>; emptyText: string; mapKey?: string
}) {
  const options = mapKey ? [...(robots.data ?? [])].sort((a, b) => Number(readyOn(b, mapKey)) - Number(readyOn(a, mapKey))) : robots.data
  return (
    <>
      <div className="flex items-end justify-between gap-2"><label className={labelClass} htmlFor={id}>{label}</label>{!robots.isPending && !robots.isError && <button type="button" className={buttonClass('secondary', 'sm')} disabled={robots.isFetching} onClick={() => void robots.refetch()}><RefreshCw size={13} aria-hidden="true" />{robots.isFetching ? 'Đang cập nhật…' : 'Cập nhật trạng thái'}</button>}</div>
      <select title="" id={id} className={`${inputClass} mt-1`} required value={value} disabled={robots.isPending || robots.isError || !robots.data?.length} onChange={event => onChange(event.target.value)}><option value="">— Chọn robot vật lý —</option>{options?.map(robot => <option key={robot.id} value={robot.robotCode}>{robot.displayName ? `${robot.displayName} · ` : ''}{robot.robotCode} · {connectionStatusLabel(robot.connectionStatus)}{mapKey && !readyOn(robot, mapKey) ? ' · chưa kiểm tra đạt trên map này' : ''}</option>)}</select>
      {robots.isPending && <p role="status" className="mt-1 text-sm text-[#64748b]">Đang tải danh sách robot…</p>}
      {robots.isError && <div role="alert" className="mt-1 text-sm text-[#b23e18]"><p>{errorText(robots.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void robots.refetch()}>Tải lại danh sách robot</button></div>}
      {!robots.isPending && !robots.isError && robots.data?.length === 0 && <div role="status" className="mt-1 text-sm text-[#b23e18]"><p>{emptyText}</p><Link className="mt-1 inline-block font-semibold text-[#1d4ed8] underline" to="/technical/robots">Đăng ký robot</Link></div>}
    </>
  )
}

import type { UseQueryResult } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { buttonClass, inputClass, labelClass } from '../../components/ui/ui-classes'
import type { PhysicalRobotOption } from './api/technical'
import { connectionStatusLabel, errorText, readyOn, robotNotReadyReason } from './technical-format'


/**
 * The registered-robot dropdown, with its loading, failed and empty states. Given `mapKey`, robots ready on
 * that map come first and the others say why, so nobody has to pick one to learn it cannot be used.
 */
export function RobotPicker({ id, label, value, onChange, robots, emptyText, mapKey, requireReady = false }: {
  id: string; label: string; value: string; onChange: (robotCode: string) => void
  robots: UseQueryResult<PhysicalRobotOption[]>; emptyText: string; mapKey?: string
  /** With `mapKey`: robots that are not confirmed and deployed on that map cannot be picked at all. */
  requireReady?: boolean
}) {
  const blockedReason = (robot: PhysicalRobotOption) => !mapKey ? null
    : requireReady ? robotNotReadyReason(robot, mapKey)
      : readyOn(robot, mapKey) ? null : 'chưa kiểm tra đạt trên map này'
  const options = mapKey ? [...(robots.data ?? [])].sort((a, b) => Number(!blockedReason(b)) - Number(!blockedReason(a))) : robots.data
  const noneReady = requireReady && mapKey && !!robots.data?.length && robots.data.every(robot => blockedReason(robot))
  return (
    <>
      <div className="flex items-end justify-between gap-2"><label className={labelClass} htmlFor={id}>{label}</label>{!robots.isPending && !robots.isError && <button type="button" className={buttonClass('secondary', 'sm')} disabled={robots.isFetching} onClick={() => void robots.refetch()}><RefreshCw size={13} aria-hidden="true" />{robots.isFetching ? 'Đang cập nhật…' : 'Cập nhật trạng thái'}</button>}</div>
      <select title="" id={id} className={`${inputClass} mt-1`} required value={value} disabled={robots.isPending || robots.isError || !robots.data?.length} onChange={event => onChange(event.target.value)}><option value="">Chọn robot vật lý</option>{options?.map(robot => { const reason = blockedReason(robot); return <option key={robot.id} value={robot.robotCode} disabled={requireReady && !!reason && robot.robotCode !== value}>{robot.displayName ? `${robot.displayName} · ` : ''}{robot.robotCode} · {connectionStatusLabel(robot.connectionStatus)}{reason && !(requireReady && robot.connectionStatus === 'UNCONFIRMED') ? ` · ${reason}` : ''}</option> })}</select>
      {noneReady && <div role="status" className="mt-1 text-sm text-amber-800"><p>Chưa có robot nào dùng được trên {mapKey}. Robot cần đã xác nhận kết nối và có lần kiểm tra triển khai mới nhất đạt trên map này.</p><Link className="mt-1 inline-block font-semibold text-[#1d4ed8] underline" to="/technical/maps">Ghi kiểm tra triển khai ở trang Bản đồ</Link></div>}
      {robots.isPending && <p role="status" className="mt-1 text-sm text-[#64748b]">Đang tải danh sách robot…</p>}
      {robots.isError && <div role="alert" className="mt-1 text-sm text-[#b23e18]"><p>{errorText(robots.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void robots.refetch()}>Tải lại danh sách robot</button></div>}
      {!robots.isPending && !robots.isError && robots.data?.length === 0 && <div role="status" className="mt-1 text-sm text-[#b23e18]"><p>{emptyText}</p><Link className="mt-1 inline-block font-semibold text-[#1d4ed8] underline" to="/technical/robots">Đăng ký robot</Link></div>}
    </>
  )
}

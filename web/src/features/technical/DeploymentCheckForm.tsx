import { useState, type FormEvent } from 'react'
import { buttonClass, inputClass, labelClass } from '../../components/ui/ui-classes'
import { CheckRow, ResultToggle, SaveBlockedHint } from './TechnicalUi'
import type { MapVersion, PhysicalRobotOption } from './api/technical'
import { useDuplicateAreaNames, useRecordDeployment } from './technical-hooks'
import { deploymentErrorText } from './technical-format'
import { notReportingText } from './robot-readiness'
import { mapShortLabel } from './poi-labels'

const shortSha = (sha: string) => (sha.length > 16 ? `${sha.slice(0, 8)}…${sha.slice(-4)}` : sha)

/**
 * The on-robot deployment check, for one robot on the map it is assigned. Neither is chosen here: a check is only
 * accepted for the assigned map (ROBOT_MAP_NOT_ASSIGNED), and Đạt only while the robot reports on it
 * (ROBOT_NOT_REPORTING), so the form says so before saving.
 */
export function DeploymentCheckForm({ robot, map, onDone, onCancel }: { robot: PhysicalRobotOption; map: MapVersion; onDone: () => void; onCancel: () => void }) {
  const deployment = useRecordDeployment()
  const duplicates = useDuplicateAreaNames()
  const [note, setNote] = useState('')
  // Nothing is chosen or ticked up front. The server derives the result from the two ticks, so the chosen
  // result only has to agree with them: Đạt needs both, Không đạt needs at least one left unticked.
  const [resultCode, setResultCode] = useState<'PASS' | 'FAIL' | null>(null)
  const [localizationPassed, setLocalizationPassed] = useState(false)
  const [displayPassed, setDisplayPassed] = useState(false)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const reporting = robot.readiness?.reportingOnAssignedMap === true
  const allTicked = localizationPassed && displayPassed
  const missingToSave = [
    !resultCode && 'chọn kết quả',
    resultCode === 'PASS' && !reporting && 'chờ robot báo về theo bản đồ này',
    resultCode === 'PASS' && !allTicked && 'tick đủ hai mục để ghi Đạt',
    resultCode === 'FAIL' && allTicked && 'bỏ tick mục không đạt',
    !note.trim() && (resultCode === 'FAIL' ? 'ghi lý do không đạt vào bằng chứng' : 'nhập bằng chứng kiểm tra'),
  ].filter((value): value is string => Boolean(value))
  const changed = () => { deployment.reset(); setRequestId(crypto.randomUUID()) }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (missingToSave.length || deployment.isPending) return
    deployment.mutate({ mapVersionId: map.id, requestId, robotCode: robot.robotCode, packageSha256: map.packageSha256, localizationPassed, displayPassed, evidenceNote: note }, { onSuccess: onDone })
  }
  return (
    <form aria-label="Kiểm tra triển khai" className="space-y-3" onSubmit={submit}>
      <p className="text-[13px] text-[#334155]">Robot <span className="font-semibold">{robot.robotCode}</span> · bản đồ <span className="font-semibold">{mapShortLabel(map, duplicates)}</span>. Chỉ ghi khi robot đã nạp đúng tệp này (checksum {shortSha(map.packageSha256)}).</p>
      <ResultToggle id="deploy-check-result" value={resultCode} passDisabled={!reporting} onChange={value => { setResultCode(value); changed() }} hint="Bỏ tick mục không đạt và ghi lý do vào bằng chứng." />
      {!reporting && <p role="status" className="text-[13px] text-amber-800">{notReportingText(robot.robotCode, map, duplicates)}</p>}
      <div className="space-y-2"><CheckRow checked={localizationPassed} onChange={value => { setLocalizationPassed(value); changed() }}>Định vị đạt</CheckRow><CheckRow checked={displayPassed} onChange={value => { setDisplayPassed(value); changed() }}>Map hiển thị đúng</CheckRow></div>
      <div><label className={labelClass} htmlFor="deploy-check-note">Bằng chứng kiểm tra</label><textarea id="deploy-check-note" rows={3} className={`${inputClass} mt-1`} required maxLength={2000} value={note} onChange={event => { setNote(event.target.value); changed() }} placeholder="Ghi nhận quan sát thực tế, sai lệch, ảnh chụp màn hình đã lưu ở đâu…" /></div>
      {deployment.error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{deploymentErrorText(deployment.error)}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2"><SaveBlockedHint id="deploy-check-missing" missing={missingToSave} tone="neutral" /><button type="button" className={buttonClass('secondary', 'sm')} onClick={onCancel}>Hủy</button><button type="submit" className={buttonClass('primary', 'sm')} aria-describedby={missingToSave.length ? 'deploy-check-missing' : undefined} disabled={deployment.isPending || missingToSave.length > 0}>{deployment.isPending ? 'Đang lưu…' : 'Lưu kết quả kiểm tra'}</button></div>
    </form>
  )
}

import { useState } from 'react'
import { PageHeader, PanelHead, LoadingPanel, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { OCCUPANCY_MAPS } from '../../features/administration/pois/map/catalog'
import { useMapVersions, useRecordDeployment, useRecordLocalization } from '../../features/technical/technical-hooks'
import { TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { errorText, stamp } from '../../features/technical/technical-format'

type Pending = { kind: 'deploy' | 'pass' | 'fail'; mapKey: string } | null

const fileName = (path: string) => path.replaceAll('\\', '/').split('/').at(-1) ?? path

/** Map versions (SRS v1.9 §3.2.b): maps are made outside the web; here the version is deployed and its localization checked. */
export default function TechnicalMapsPage() {
  const statuses = useMapVersions()
  const deploy = useRecordDeployment()
  const localization = useRecordLocalization()
  const [pending, setPending] = useState<Pending>(null)
  const busy = deploy.isPending || localization.isPending
  const error = deploy.error ?? localization.error
  const close = () => { setPending(null); deploy.reset(); localization.reset() }

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Kỹ thuật" title="Version map" description="Bản đồ được tạo bên ngoài web. Mỗi version phải được deploy đúng lên robot và đạt kiểm tra localization trước khi xác nhận tuyến dùng version đó." />
      <section className={panelClass} aria-label="Danh sách version map">
        <PanelHead title="Các version đã đăng ký" description="Upload package mới cần API kỹ thuật (đề xuất B7); hiện version mới được thêm bằng script export trong repo." />
        {statuses.isPending ? <LoadingPanel /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-[#f1f5f9]"><th className={thClass}>Version</th><th className={thClass}>File nguồn</th><th className={thClass}>Kích thước</th><th className={thClass}>Deploy lên robot</th><th className={thClass}>Localization</th><th className={thClass}><span className="sr-only">Thao tác</span></th></tr></thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {OCCUPANCY_MAPS.map((map) => {
                  const status = statuses.data?.find((item) => item.mapKey === map.mapKey)
                  const check = status?.localization
                  return (
                    <tr key={map.mapKey} className={rowClass}>
                      <td className={`${tdClass} font-mono font-semibold text-[#0f172a]`}>{map.mapKey}</td>
                      <td className={`${tdClass} text-[#64748b]`}>{fileName(map.sourceYaml)}</td>
                      <td className={`${tdClass} tabular-nums text-[#64748b]`}>{map.width}×{map.height} · {map.resolution} m/px</td>
                      <td className={tdClass}>{status?.deployedAt ? <span className="text-[#334155]">{stamp(status.deployedAt)} · {status.deployedBy}</span> : <ToneBadge tone="muted">Chưa deploy</ToneBadge>}</td>
                      <td className={tdClass}>
                        {check ? <span title={check.note}><ToneBadge tone={check.passed ? 'ok' : 'danger'}>{check.passed ? 'Đạt' : 'Không đạt'}</ToneBadge> <span className="ml-1 text-xs text-[#64748b]">{stamp(check.at)}</span></span> : <ToneBadge tone="warn">Chưa kiểm tra</ToneBadge>}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap text-right`}>
                        <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setPending({ kind: 'deploy', mapKey: map.mapKey })}>Ghi đã deploy</button>
                        <button type="button" className={`${buttonClass('secondary', 'sm')} ml-2`} disabled={!status?.deployedAt} onClick={() => setPending({ kind: 'pass', mapKey: map.mapKey })}>Localization đạt</button>
                        <button type="button" className={`${buttonClass('ghost', 'sm')} ml-1`} disabled={!status?.deployedAt} onClick={() => setPending({ kind: 'fail', mapKey: map.mapKey })}>Không đạt</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmationDialog
        open={pending?.kind === 'deploy'}
        title={`Ghi đã deploy ${pending?.mapKey ?? ''} lên robot?`}
        description="Chỉ ghi khi robot đang chạy đúng file map của version này. Kết quả localization cũ của version sẽ bị xóa và cần kiểm tra lại."
        confirmLabel="Ghi đã deploy"
        withReason={false}
        busy={busy}
        error={error ? errorText(error) : null}
        onCancel={close}
        onConfirm={() => pending && deploy.mutate(pending.mapKey, { onSuccess: close })}
      />
      <ConfirmationDialog
        open={pending?.kind === 'pass' || pending?.kind === 'fail'}
        tone={pending?.kind === 'fail' ? 'danger' : 'default'}
        title={pending?.kind === 'pass' ? `Localization ${pending.mapKey} đạt?` : `Localization ${pending?.mapKey ?? ''} không đạt?`}
        description="Ghi kết quả kiểm tra tại chỗ: vị trí robot trên Twin khớp thực tế và hiển thị đúng."
        confirmLabel="Ghi kết quả"
        requireReason
        reasonLabel="Đã kiểm tra gì"
        busy={busy}
        error={error ? errorText(error) : null}
        onCancel={close}
        onConfirm={(note) => pending && localization.mutate({ mapKey: pending.mapKey, passed: pending.kind === 'pass', note: note ?? '' }, { onSuccess: close })}
      />
    </TechnicalPage>
  )
}

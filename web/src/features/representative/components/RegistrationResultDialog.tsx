import { CheckCircle2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'
import { ConfirmationDialog } from './RepUi'

export type RegistrationResult = { id: string; kind: 'submitted' | 'updated' | 'resubmitted' }

const titles: Record<RegistrationResult['kind'], string> = {
  submitted: 'Đã gửi đăng ký', updated: 'Đã lưu thay đổi', resubmitted: 'Đã gửi lại đăng ký',
}

/** Only the successful API mutation navigates with this result; URL parameters never open it. */
export function RegistrationResultDialog() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as { registrationResult?: RegistrationResult; justSent?: boolean } | null
  const result = state?.registrationResult
  const open = Boolean(result && titles[result.kind] && location.pathname === `/dai-dien/dang-ky/${result.id}`)
  function dismiss(showRoster = false) {
    const nextState = { ...state }
    delete nextState.registrationResult
    delete nextState.justSent
    const params = new URLSearchParams(location.search)
    if (showRoster) params.set('tab', 'roster')
    void navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true, state: nextState })
    document.getElementById('rep-main')?.focus({ preventScroll: true })
  }
  return <ConfirmationDialog open={open} title={result ? titles[result.kind] : ''} tone="primary" dialogRole="dialog"
    className="rep-dialog--result" illustration={<CheckCircle2 size={48} className="rep-result-icon" aria-hidden="true" />}
    cancelLabel="Xem hồ sơ" confirmLabel="Xem danh sách" onClose={() => dismiss()} onConfirm={() => dismiss(true)}>
    <p>Hệ thống đã ghi nhận {result?.kind === 'updated' ? 'thay đổi của bạn' : 'đăng ký của bạn'}. Kết quả xét duyệt sẽ cập nhật ở từng dòng trong danh sách.</p>
    <p className="rep-hint">Bạn có thể theo dõi lời mời và yêu cầu đổi email trong hồ sơ này.</p>
  </ConfirmationDialog>
}

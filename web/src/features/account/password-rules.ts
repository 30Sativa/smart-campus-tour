export const MIN_PASSWORD_LENGTH = 12
export const MAX_PASSWORD_LENGTH = 128

/** UX-only mirror of the server policy (AccountPasswordPolicy); the server stays the authority. */
export function passwordProblems(form: { currentPassword: string; newPassword: string; confirm: string }): Record<string, string> {
  const problems: Record<string, string> = {}
  if (!form.currentPassword) problems.currentPassword = 'Nhập mật khẩu hiện tại.'
  if (!form.newPassword.trim()) problems.newPassword = 'Nhập mật khẩu mới.'
  else if (form.newPassword.length < MIN_PASSWORD_LENGTH || form.newPassword.length > MAX_PASSWORD_LENGTH) {
    problems.newPassword = `Mật khẩu mới cần ${MIN_PASSWORD_LENGTH} đến ${MAX_PASSWORD_LENGTH} ký tự.`
  } else if (form.newPassword === form.currentPassword) problems.newPassword = 'Mật khẩu mới phải khác mật khẩu hiện tại.'
  if (!problems.newPassword && form.confirm !== form.newPassword) problems.confirm = 'Mật khẩu nhập lại không khớp.'
  return problems
}

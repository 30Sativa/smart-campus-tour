import { ApiError } from '../../api/client'

export function errorText(error: unknown) {
  if (error instanceof ApiError && error.body) return error.body
  return error instanceof Error ? error.message : 'Không lưu được. Thử lại.'
}

export function mapUploadFieldErrors(error: unknown): { areaKey?: string; areaName?: string; package?: string; form?: string } {
  if (!(error instanceof ApiError) || !error.body) return { form: errorText(error) }
  try {
    const payload = JSON.parse(error.body) as { errors?: Record<string, unknown>; message?: unknown }
    const errors = payload.errors
    if (!errors || typeof errors !== 'object') return { form: typeof payload.message === 'string' ? payload.message : 'Không upload được package map.' }
    const mapped: { areaKey?: string; areaName?: string; package?: string; form?: string } = {}
    for (const [field, raw] of Object.entries(errors)) {
      const messages = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : typeof raw === 'string' ? [raw] : []
      const message = messages[0]
      if (!message) continue
      const normalized = field.toLowerCase()
      if (normalized.includes('areakey')) mapped.areaKey = 'Mã khu vực chỉ gồm chữ thường không dấu, số và dấu gạch nối; ký tự đầu/cuối phải là chữ hoặc số.'
      else if (normalized.includes('areaname')) mapped.areaName = 'Tên khu vực không được để trống và tối đa 150 ký tự.'
      else if (normalized.includes('package') || normalized.includes('image') || normalized.includes('yaml')) mapped.package = message
      else mapped.form = message
    }
    return Object.keys(mapped).length ? mapped : { form: typeof payload.message === 'string' ? payload.message : 'Dữ liệu upload chưa hợp lệ.' }
  } catch {
    return { form: 'Không upload được package map. Kiểm tra ZIP và thử lại.' }
  }
}

export const stamp = (iso: string | null) => iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '-'

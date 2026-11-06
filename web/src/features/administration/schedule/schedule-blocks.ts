import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiClient } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'
import type { TourShiftBlock, TourShifts } from '../tours/types'

/** `shiftCode` null closes the whole campus day (docs/lich-tour-theo-ca.md §5). */
export type ScheduleBlockInput = { requestId: string; date: string; shiftCode: string | null; reason: string }

const scheduleBlocksApi = {
  list: (from: string, to: string) =>
    apiClient<ApiResponse<TourShifts>>(`/api/admin/schedule-blocks?${new URLSearchParams({ from, to })}`).then(r => r.data!),
  create: (input: ScheduleBlockInput) =>
    apiClient<ApiResponse<TourShiftBlock>>('/api/admin/schedule-blocks', { method: 'POST', json: input }).then(r => r.data!),
  remove: ({ id, requestId }: { id: string; requestId: string }) =>
    apiClient<ApiResponse<null>>(`/api/admin/schedule-blocks/${id}/remove`, { method: 'POST', json: { requestId } }),
}

const KEY = ['admin', 'schedule-blocks'] as const

export function useScheduleBlocks(from: string, to: string) {
  return useQuery({ queryKey: [...KEY, from, to], queryFn: () => scheduleBlocksApi.list(from, to) })
}
export function useCreateScheduleBlock() {
  const client = useQueryClient()
  return useMutation({ mutationFn: scheduleBlocksApi.create, onSuccess: () => client.invalidateQueries({ queryKey: KEY }) })
}
export function useRemoveScheduleBlock() {
  const client = useQueryClient()
  return useMutation({ mutationFn: scheduleBlocksApi.remove, onSuccess: () => client.invalidateQueries({ queryKey: KEY }) })
}

/** Why a change was refused, in words; `tours` names each Tour still in the way of SHIFT_HAS_TOURS. */
export function scheduleBlockError(error: unknown): { message: string; tours: string[] } {
  if (!(error instanceof ApiError)) return { message: 'Không thể kết nối máy chủ. Hãy thử lại.', tours: [] }
  if (error.status === 401) return { message: 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.', tours: [] }
  if (error.status === 403) return { message: 'Chỉ Admin mới khoá được lịch.', tours: [] }
  let body: { message?: unknown; errors?: { blockers?: Array<{ message?: unknown }> } } = {}
  try { body = JSON.parse(error.body) as typeof body } catch { /* A non-JSON response uses the wording below. */ }
  const tours = (body.errors?.blockers ?? []).flatMap(blocker => typeof blocker.message === 'string' ? [blocker.message] : [])
  if (error.status < 500 && typeof body.message === 'string' && body.message.trim()) return { message: body.message.trim(), tours }
  return { message: 'Máy chủ chưa xử lý được yêu cầu. Hãy thử lại.', tours }
}

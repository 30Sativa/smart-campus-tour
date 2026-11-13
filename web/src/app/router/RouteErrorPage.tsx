import { useEffect } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { isChunkLoadError, reloadForNewVersion } from '../chunk-reload'

/**
 * Replaces React Router's default "Unexpected Application Error!" screen.
 * A stale lazy chunk after a deploy reloads the page by itself; anything else shows a short message
 * with a reload button.
 */
export default function RouteErrorPage() {
  const error = useRouteError()
  const staleChunk = isChunkLoadError(error)

  useEffect(() => {
    if (staleChunk) reloadForNewVersion()
  }, [staleChunk])

  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : null

  return (
    <div className="min-h-[100dvh] grid place-items-center bg-[#f5f7f8] p-6">
      <div className="max-w-md text-center space-y-4" role="alert">
        <h1 className="text-xl font-semibold text-slate-900">
          {staleChunk ? 'Trang vừa được cập nhật phiên bản mới' : 'Đã có lỗi xảy ra'}
        </h1>
        <p className="text-slate-600">
          {staleChunk
            ? 'Đang tải lại để lấy phiên bản mới nhất. Nếu trang không tự tải lại, hãy bấm nút bên dưới.'
            : 'Vui lòng tải lại trang. Nếu lỗi vẫn còn, hãy liên hệ quản trị viên.'}
        </p>
        {!staleChunk && detail && <p className="text-xs text-slate-400 break-words">{detail}</p>}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center rounded-lg bg-[#f26f21] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Tải lại trang
        </button>
      </div>
    </div>
  )
}

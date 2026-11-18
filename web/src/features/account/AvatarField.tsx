import { useRef, useState } from 'react'
import { ImageUp, Trash2 } from 'lucide-react'
import { ApiError } from '../../api/client'
import { CloudinaryUploadError } from '../../api/cloudinary-upload'
import { AccountAvatar } from '../../components/ui/AccountAvatar'
import { buttonClass } from '../../components/ui/ui-classes'
import { notify } from '../../components/ui/toast-store'
import { readAccountError } from './api/account-api'
import { useSetMyAvatar } from './hooks'

function avatarError(error: unknown): string | null {
  if (error instanceof DOMException && error.name === 'AbortError') return null
  if (error instanceof CloudinaryUploadError) return error.message
  if (error instanceof ApiError) {
    if (error.status === 503) return 'Máy chủ chưa cấu hình Cloudinary nên chưa tải được ảnh đại diện.'
    const read = readAccountError(error, 'Không lưu được ảnh đại diện. Vui lòng thử lại.')
    return read.fields.avatarUrl ?? read.message
  }
  return error instanceof Error && error.message ? error.message : 'Không lưu được ảnh đại diện. Vui lòng thử lại.'
}

/**
 * ADR-0064: the account's own picture. The file goes straight from the browser to Cloudinary with a backend signature,
 * then becomes the avatar; the header shows it too. Removing it keeps the initials.
 */
export function AvatarField({ name, avatarUrl }: { name: string; avatarUrl: string | null | undefined }) {
  const picker = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const [percent, setPercent] = useState<number | null>(null)
  const save = useSetMyAvatar(setPercent)
  const uploading = save.isPending && percent !== null
  const error = save.isError ? avatarError(save.error) : null

  const run = (file: File | null) => {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setPercent(file ? 0 : null)
    save.mutate({ file, signal: controller.signal }, {
      onSuccess: () => notify({ title: file ? 'Đã cập nhật ảnh đại diện' : 'Đã bỏ ảnh đại diện' }),
      onSettled: () => setPercent(null),
    })
  }

  return (
    <div className="flex items-center gap-4" role="group" aria-labelledby="avatar-title">
      <AccountAvatar name={name} url={avatarUrl} size={72} className="rounded-2xl" />
      <div className="min-w-0 flex-1">
        <p id="avatar-title" className="text-[13px] font-semibold text-[#0f172a]">Ảnh đại diện</p>
        <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" tabIndex={-1}
          aria-label="Chọn ảnh đại diện" disabled={save.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) run(file)
          }} />
        <div className="mt-1.5 flex flex-wrap gap-2">
          {uploading
            ? <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => abort.current?.abort()}>Hủy tải lên</button>
            : <button type="button" className={buttonClass('secondary', 'sm')} disabled={save.isPending} onClick={() => picker.current?.click()}>
              <ImageUp size={14} aria-hidden="true" />{avatarUrl ? 'Đổi ảnh' : 'Tải ảnh lên'}
            </button>}
          {avatarUrl && !save.isPending && <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => run(null)}>
            <Trash2 size={14} aria-hidden="true" />Bỏ ảnh
          </button>}
        </div>
        {uploading && <progress className="mt-2 h-1.5 w-full" max={100} value={percent ?? 0} aria-label="Tiến độ tải ảnh" />}
        {error
          ? <p role="alert" className="mt-1 text-xs text-[#b23e31]">{error}</p>
          : <p role="status" className="mt-1 text-xs text-[#64748b]">{uploading ? `Đang tải lên… ${percent}%` : 'JPG, PNG, WebP hoặc HEIC, tối đa 10 MB.'}</p>}
      </div>
    </div>
  )
}

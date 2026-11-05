import { useId, useState } from 'react'
import type { RefObject } from 'react'
import { Upload } from 'lucide-react'
import { repButton } from '../rep-classes'

/** Native picker and drop zone share the same parser and explicit confirmation. */
export function HoopDrop({ onFile, inputRef, accept, inputLabel, validating, hasList }: {
  onFile: (file: File) => void
  inputRef: RefObject<HTMLInputElement | null>
  accept: string
  inputLabel: string
  validating: string | null
  hasList: boolean
}) {
  const [over, setOver] = useState(false)
  const inputId = useId()
  return <div className={`rep-upload-zone${over ? ' is-over' : ''}`}
    onDragOver={event => { event.preventDefault(); if (!validating) setOver(true) }}
    onDragLeave={() => setOver(false)}
    onDrop={event => {
      event.preventDefault()
      setOver(false)
      const file = event.dataTransfer.files[0]
      if (!validating && file) onFile(file)
    }}>
    <Upload size={24} aria-hidden="true" />
    <p className="rep-file-label">{validating ? 'Đang kiểm tra tệp' : 'Kéo tệp danh sách vào đây'}</p>
    <p className="rep-hint">{validating ?? 'Hoặc chọn tệp .xlsx hoặc .csv từ máy tính. Nội dung chỉ được dùng sau khi bạn xác nhận.'}</p>
    <input id={inputId} ref={inputRef} hidden type="file" accept={accept} aria-label={inputLabel} disabled={Boolean(validating)}
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file) }} />
    <button type="button" className={repButton(hasList ? 'secondary' : 'dark')} disabled={Boolean(validating)} onClick={() => inputRef.current?.click()}>
      {validating ? 'Đang kiểm tra...' : 'Chọn tệp'}
    </button>
    {validating && <p className="rep-hint" role="status">Đang kiểm tra định dạng và từng dòng trong tệp.</p>}
  </div>
}

import { useState } from 'react'
import { Download } from 'lucide-react'
import { buttonClass } from '../../components/ui/ui-classes'
import { technicalApi } from './api/technical'
import { errorText, mapText } from './technical-format'

/**
 * "Tải tệp bản đồ (.zip)": the uploaded package as the server stores it, saved under the name the server sends with
 * it (its stored package file name), so the file copied to the MiniPC is exactly the one the checksum names.
 * Shared by the map detail and the robot's "Trên MiniPC" steps.
 */
export function MapPackageDownloadButton({ mapVersionId, fileName, label = mapText.download }: { mapVersionId: string; fileName: string; label?: string }) {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const download = async () => {
    setState({ busy: true, error: null })
    try {
      const blob = await technicalApi.getMapPackage(mapVersionId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setState({ busy: false, error: null })
    } catch (cause) {
      setState({ busy: false, error: errorText(cause) })
    }
  }
  return <span className="mt-1.5 block">
    <button type="button" className={buttonClass('secondary', 'sm')} disabled={state.busy} onClick={() => void download()}><Download size={13} aria-hidden="true" />{state.busy ? mapText.downloading : label}</button>
    {state.error && <span role="alert" className="mt-1 block text-xs text-[#b23e31]">{state.error}</span>}
  </span>
}

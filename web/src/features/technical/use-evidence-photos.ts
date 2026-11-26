import { useEffect, useRef, useState } from 'react'
import { EVIDENCE_PHOTO_MAX, evidencePhotoErrorText, uploadEvidencePhoto } from './api/evidence-photos'

type Upload = { key: string; name: string; percent: number }

/**
 * ADR-0072: the 0-5 photos of one deployment check, POI verification or route test run. Each file goes straight to
 * Cloudinary as it is picked; only the stored addresses are saved with the record. `onChange` runs whenever the saved
 * list changes, so the form can start a new request id (the photos are part of the retried request).
 */
export function useEvidencePhotos(onChange: () => void) {
  const [photos, setPhotos] = useState<string[]>([])
  const [uploads, setUploads] = useState<Upload[]>([])
  const [problems, setProblems] = useState<string[]>([])
  const controllers = useRef(new Map<string, AbortController>())
  const changed = useRef(onChange)
  useEffect(() => { changed.current = onChange })
  useEffect(() => {
    const running = controllers.current
    return () => { for (const controller of running.values()) controller.abort() }
  }, [])

  const add = (files: File[]) => {
    const room = EVIDENCE_PHOTO_MAX - photos.length - uploads.length
    const taken = files.slice(0, Math.max(0, room))
    setProblems(files.length > taken.length ? [`Mỗi bản ghi có tối đa ${EVIDENCE_PHOTO_MAX} ảnh, đã bỏ ${files.length - taken.length} ảnh.`] : [])
    for (const file of taken) {
      const key = crypto.randomUUID()
      const controller = new AbortController()
      controllers.current.set(key, controller)
      setUploads(current => [...current, { key, name: file.name, percent: 0 }])
      const setPercent = (percent: number) => setUploads(current => current.map(item => item.key === key ? { ...item, percent } : item))
      uploadEvidencePhoto(file, setPercent, controller.signal)
        .then(url => { setPhotos(current => [...current, url]); changed.current() })
        .catch((error: unknown) => { if (!controller.signal.aborted) setProblems(current => [...current, evidencePhotoErrorText(error)]) })
        .finally(() => { controllers.current.delete(key); setUploads(current => current.filter(item => item.key !== key)) })
    }
  }
  const cancel = (key: string) => controllers.current.get(key)?.abort()
  const remove = (url: string) => { setPhotos(current => current.filter(item => item !== url)); changed.current() }

  return { photos, uploads, problems, uploading: uploads.length > 0, add, cancel, remove }
}

export type EvidencePhotoState = ReturnType<typeof useEvidencePhotos>

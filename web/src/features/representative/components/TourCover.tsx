import { useState, type ImgHTMLAttributes } from 'react'
import { tourCoverUrl } from '../../../api/tour-cover'
import type { TourImage } from '../tour-image'

/**
 * The picture of a Tour: the cover image Staff uploaded, or the Tour's sample picture (`tour-image.ts`) when it has
 * none. Whether a Tour has an upload is only known by loading it, so the uploaded URL is tried first and a failed load
 * (no upload, or no Cloudinary in this build) falls back to the sample.
 */
function useTourCover(tourId: string, image: TourImage, tourName?: string) {
  const uploaded = tourCoverUrl(tourId)
  const [failed, setFailed] = useState<string | null>(null)
  const showsUpload = uploaded !== null && failed !== uploaded
  return {
    src: showsUpload ? uploaded : image.src,
    alt: showsUpload ? (tourName ? `Ảnh Tour ${tourName}` : 'Ảnh Tour') : image.alt,
    showsUpload,
    onError: () => { if (showsUpload) setFailed(uploaded) },
  }
}

type ImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'onError'>

/** The Tour's picture as a plain `<img>`; `decorative` keeps `alt=""` for an image beside the Tour's own name. */
export function TourCoverImg({ tourId, tourName, image, decorative = false, ...img }: ImgProps & {
  tourId: string; tourName?: string; image: TourImage; decorative?: boolean
}) {
  const cover = useTourCover(tourId, image, tourName)
  return <img {...img} src={cover.src} alt={decorative ? '' : cover.alt} onError={cover.onError} />
}

/** The Tour's picture in a figure; only the sample picture is captioned "Ảnh minh họa". */
export function TourCoverFigure({ className, tourId, tourName, image, ...img }: ImgProps & {
  className: string; tourId: string; tourName?: string; image: TourImage
}) {
  const cover = useTourCover(tourId, image, tourName)
  return <figure className={className}>
    <img {...img} src={cover.src} alt={cover.alt} onError={cover.onError} />
    {!cover.showsUpload && <figcaption>Ảnh minh họa</figcaption>}
  </figure>
}

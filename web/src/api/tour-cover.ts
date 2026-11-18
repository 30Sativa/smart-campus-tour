/**
 * A Tour's cover image lives on Cloudinary under a public ID fixed by the Tour's id
 * (`smartcampus/tours/cover/<id without dashes>`): Staff upload it from the Tour form, School Representatives see it
 * on the Tour's card. Nothing about it is stored in the database, so a Tour without an upload has no image there:
 * show the URL in an `<img>` and fall back to a sample picture on `error`.
 *
 * Null when the build has no `VITE_CLOUDINARY_CLOUD_NAME`: then every Tour keeps its sample picture.
 */
export function tourCoverUrl(tourId: string, size: { width: number; height: number } = { width: 1200, height: 675 }): string | null {
  const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim()
  const id = tourId.replace(/-/g, '').toLowerCase()
  if (!cloud || !/^[0-9a-f]{32}$/.test(id)) return null
  // Cropped to the card's 16:9 around the interesting part, in the lightest format the browser takes.
  return `https://res.cloudinary.com/${cloud}/image/upload/c_fill,g_auto,w_${size.width},h_${size.height},f_auto,q_auto/smartcampus/tours/cover/${id}`
}

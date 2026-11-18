/**
 * ADR-0064: the Cloudinary picture at `size` CSS px (square, cropped around the face, lightest format and quality for
 * this browser, sharp on high-density screens). Any other address is returned as it is.
 */
export function avatarSrc(url: string, size: number): string {
  const marker = '/image/upload/'
  const at = url.indexOf(marker)
  if (!url.startsWith('https://res.cloudinary.com/') || at < 0) return url
  return `${url.slice(0, at + marker.length)}c_fill,g_face,h_${size * 2},w_${size * 2},f_auto,q_auto/${url.slice(at + marker.length)}`
}

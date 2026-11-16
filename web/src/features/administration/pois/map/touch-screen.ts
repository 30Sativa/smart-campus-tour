/** A finger is the main pointer (phone, tablet), so map hints talk about fingers instead of a mouse wheel. */
export const isTouchScreen = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches

/** How to zoom and move a `ZoomableMap`, for the device in hand. */
export const mapZoomHint = (touch: boolean) => touch
  ? 'Dùng hai ngón để phóng to, sau đó kéo để di chuyển bản đồ'
  : 'Cuộn chuột để phóng to, kéo để di chuyển bản đồ'

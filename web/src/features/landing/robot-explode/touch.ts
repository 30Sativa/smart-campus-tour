import { useEffect, useState } from 'react'

/** A screen driven by touch alone: a coarse pointer and no hover (phones, tablets). */
export const TOUCH_ONLY_QUERY = '(hover: none) and (pointer: coarse)'

function matchesTouchOnly() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(TOUCH_ONLY_QUERY).matches
}

/** True on a touch-only screen; follows the media query when it changes (a tablet docked to a keyboard). */
export function useTouchOnly() {
  const [touch, setTouch] = useState(matchesTouchOnly)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(TOUCH_ONLY_QUERY)
    const update = () => setTouch(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])
  return touch
}

/** The first hint over the map: the buttons on a touch screen, the keys on a keyboard. */
export function driveStartHint(touch: boolean) {
  return touch ? 'Chạm các nút bên dưới để lái' : 'Nhấn W hoặc ↑ để lái robot'
}

/** Loading-screen tips; a touch screen gets the ones it can follow with the panel buttons. */
export function driveTips(touch: boolean): readonly string[] {
  return touch
    ? [
        'Khi bản đồ hiện ra, chạm các nút W A S D để lái, giữ Space để phanh.',
        'Chạm P để robot tự đi qua từng điểm dừng.',
        'Chạm C để đổi máy quay: Chase, Điện ảnh, Trên cao.',
        'Máy chạy chậm? Chọn đồ họa Mượt trong phần cài đặt.',
      ]
    : [
        'W A S D hoặc phím mũi tên để lái, Space để phanh.',
        'Nhấn P để robot tự đi qua từng điểm dừng.',
        'Nhấn C để đổi máy quay: Chase, Điện ảnh, Trên cao.',
        'Nhấn N để chuyển ngày và đêm trên bản đồ khuôn viên.',
        'Máy chạy chậm? Chọn đồ họa Mượt trong phần cài đặt.',
      ]
}

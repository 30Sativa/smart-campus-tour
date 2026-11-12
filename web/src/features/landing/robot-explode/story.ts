/**
 * The scroll story that opens section 04: five chapters, each a camera shot
 * of the robot on the campus map, played as the visitor scrolls (like a video
 * scrubbed by the scroll bar); after the last one the map becomes the
 * interactive test drive. Plain maths, no three.js, so it can be tested.
 *
 * Shots are in the map's metres round the robot standing at `at` facing
 * `yaw`: `forward` is the robot's nose, `side` its left as seen on screen,
 * `h` height above the floor.
 */

export const STORY_CHAPTERS = [
  { kicker: '01 / Quan sát', title: 'Robot đang chạy.', after: 'Quyết định đi trước một bước.', body: 'Robot tự đi qua khuôn viên theo tuyến đã chuẩn bị, dừng ở từng điểm tham quan.' },
  { kicker: '02 / Cảm nhận', title: 'Chuyển động', after: 'thành tín hiệu.', body: 'LiDAR, bốn cảm biến siêu âm và camera đọc không gian quanh robot nhiều lần mỗi giây.' },
  { kicker: '03 / Mô hình', title: 'Robot thật', after: 'thành bản sao số.', body: 'Từng linh kiện có một bản số trong Digital Twin, cùng vị trí và trạng thái của robot.' },
  { kicker: '04 / Tuyến đường', title: 'Bản đồ lộ ra', after: 'đường đi rõ nhất.', body: 'Bản đồ tầng và đồ thị hành lang cho ra đường an toàn tới điểm dừng tiếp theo.' },
  { kicker: '05 / Quyết định', title: 'Mọi tín hiệu hội tụ', after: 'thành một bước đi.', body: 'Máy tính trên robot gộp tất cả thành lệnh cho hai bánh xe, ngay tại chỗ.' },
] as const

/** Screens of scrolling the story takes, plus one more for the drive at the end. */
export const STORY_SCREENS = STORY_CHAPTERS.length
/** Distance ahead of the robot of the chip the routes and signals converge on, m, and its height. */
export const CHIP = { ahead: 44, h: 1.9 } as const

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
export const smooth = (t: number) => { const k = clamp(t); return k * k * (3 - 2 * k) }

/**
 * Story progress (0 start .. 1 end) from how far the section has scrolled
 * (0 when it reaches the top of the screen, 1 when its end does): the story
 * takes the first `STORY_SCREENS` of `STORY_SCREENS + 1` screens.
 */
export function storyProgress(scrolled: number) {
  return clamp(scrolled * (STORY_SCREENS + 1) / STORY_SCREENS)
}

/** The chapter under way and how far into it (0..1); `index` is `STORY_CHAPTERS.length` once the story is over. */
export function storyPhase(story: number) {
  if (story >= 1) return { index: STORY_CHAPTERS.length, local: 0 }
  const s = clamp(story) * STORY_CHAPTERS.length
  const index = Math.min(STORY_CHAPTERS.length - 1, Math.floor(s))
  return { index, local: s - index }
}

/** How the story dresses the scene at `story`: the scan band's place, x-ray, the digital backdrop, tunnel and convergence (each 0..1). */
export function storyLook(story: number) {
  const s = story >= 1 ? -1 : clamp(story) * STORY_CHAPTERS.length
  const active = s >= 0
  return {
    /** The robot drives itself through chapters 1–2 and is parked from chapter 3. */
    parked: active && s >= 2,
    /**
     * The stage: the campus dims and blurs into haze round the robot, a rim
     * light picks out its outline and people step out of the shot, so the
     * opening chapters are about the robot alone.
     */
    stage: active ? 0.75 + 0.25 * smooth(s / 0.6) : 0,
    /** The scan, a band of light sweeping over the robot's body from its back to its nose through chapter 2; null when not shown. */
    scan: active && s > 1 && s < 1.95 ? clamp((s - 1) / 0.9) : null,
    xray: active ? smooth((s - 1.75) / 0.6) * (1 - smooth((s - 4.6) / 0.4)) : 0,
    digital: active ? smooth((s - 1.9) / 0.6) : 0,
    tunnel: active ? smooth((s - 2.75) / 0.4) * (1 - smooth((s - 4.25) / 0.4)) : 0,
    converge: active ? smooth((s - 3.7) / 0.5) : 0,
  }
}

export type Shot = { eye: { forward: number; side: number; h: number }; look: { forward: number; side: number; h: number } }

/** Orbit position at `angle` from the robot's nose (positive: to its left on screen), `distance` out and `h` up. */
function round(angle: number, distance: number, h: number) {
  return { forward: Math.cos(angle) * distance, side: Math.sin(angle) * distance, h }
}

/** The shot of one chapter at `local` (0..1) into it. */
function chapterShot(index: number, local: number): Shot {
  switch (index) {
    // A low hero shot gliding from the front three-quarter round towards the side, closing in on the robot.
    case 0: return { eye: round(0.55 + 0.85 * local, 3.3 - 0.4 * local, 0.45 + 0.2 * local), look: { forward: 0.15, side: 0, h: 0.62 } }
    // Close side profile at the robot's height, drifting slowly, as the scan passes over it.
    case 1: return { eye: round(1.4 + 0.3 * local, 3.1 - 0.25 * local, 0.75), look: { forward: 0, side: 0, h: 0.62 } }
    // Three-quarter front, a little above: the digital model.
    case 2: return { eye: round(0.6 - 0.3 * local, 3.5, 1.6 + 0.3 * local), look: { forward: 0, side: 0, h: 0.75 } }
    // Down the tunnel of the route, towards the chip.
    case 3: return { eye: { forward: -2.5 + 30 * local, side: 0, h: CHIP.h + 0.1 }, look: { forward: 10 + 30 * local, side: 0, h: CHIP.h } }
    // Facing the chip as every signal converges on it.
    default: return { eye: { forward: CHIP.ahead - 13 + 4 * local, side: 0, h: CHIP.h + 0.4 }, look: { forward: CHIP.ahead, side: 0, h: CHIP.h } }
  }
}

const mix = (a: Shot['eye'], b: Shot['eye'], k: number) => ({ forward: a.forward + (b.forward - a.forward) * k, side: a.side + (b.side - a.side) * k, h: a.h + (b.h - a.h) * k })

/** The camera at `story`: each chapter's shot, easing into the next over its last third. */
export function storyShot(story: number): Shot {
  const { index, local } = storyPhase(Math.min(story, 0.9999))
  const here = chapterShot(index, local)
  if (index >= STORY_CHAPTERS.length - 1 || local < 0.66) return here
  const next = chapterShot(index + 1, 0)
  const k = smooth((local - 0.66) / 0.34)
  return { eye: mix(here.eye, next.eye, k), look: mix(here.look, next.look, k) }
}

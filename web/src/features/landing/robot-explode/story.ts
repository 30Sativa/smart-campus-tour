/**
 * The intro video that opens section 04 (`web/public/videos/robot-intro.mp4`):
 * five chapters of the robot, one after another, each held for
 * `INTRO_CHAPTER_SECONDS`, the text of each laid over the video by the page.
 * After it the section shows the robot's parts. Plain data and maths, so it
 * can be tested.
 */

export const STORY_CHAPTERS = [
  { kicker: '01 / Quan sát', title: 'Robot đang chạy.', after: 'Quyết định đi trước một bước.', body: 'Robot tự đi qua khuôn viên theo tuyến đã chuẩn bị, dừng ở từng điểm tham quan.' },
  { kicker: '02 / Cảm nhận', title: 'Chuyển động', after: 'thành tín hiệu.', body: 'LiDAR, bốn cảm biến siêu âm và camera đọc không gian quanh robot nhiều lần mỗi giây.' },
  { kicker: '03 / Mô hình', title: 'Robot thật', after: 'thành bản sao số.', body: 'Từng linh kiện có một bản số trong Digital Twin, cùng vị trí và trạng thái của robot.' },
  { kicker: '04 / Tuyến đường', title: 'Bản đồ lộ ra', after: 'đường đi rõ nhất.', body: 'Bản đồ tầng và đồ thị hành lang cho ra đường an toàn tới điểm dừng tiếp theo.' },
  { kicker: '05 / Quyết định', title: 'Mọi tín hiệu hội tụ', after: 'thành một bước đi.', body: 'Máy tính trên robot gộp tất cả thành lệnh cho hai bánh xe, ngay tại chỗ.' },
] as const

/** Seconds each chapter lasts in the intro video (it was rendered at this pace). */
export const INTRO_CHAPTER_SECONDS = 3.6

/** The chapter on screen `seconds` into the intro video. */
export function introChapter(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return 0
  return Math.min(STORY_CHAPTERS.length - 1, Math.floor(seconds / INTRO_CHAPTER_SECONDS))
}

/** When chapter `index` starts in the intro video, s. */
export function chapterStart(index: number) {
  return Math.max(0, Math.min(STORY_CHAPTERS.length - 1, index)) * INTRO_CHAPTER_SECONDS
}

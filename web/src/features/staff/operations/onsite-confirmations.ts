import type { StartConfirmation } from '../../administration/tours/types'

/**
 * The four on-site confirmations (SRS §7) the departure of an opened Tour carries; the server records them. They are
 * asked when the robot is about to move, after the Operator has seen the live camera, map and robot on the opened Tour.
 */
export const CONFIRMATIONS: Array<{ key: keyof StartConfirmation; label: string; hint: string }> = [
  { key: 'robotPlaced', label: 'Robot ở đúng điểm xuất phát', hint: 'Vị trí trên bản đồ khớp thực tế.' },
  { key: 'areaClear', label: 'Đường đi phía trước thông thoáng', hint: 'Không có người hay vật cản.' },
  { key: 'attendantPresent', label: 'Có người đi kèm robot', hint: 'Sẵn sàng bấm nút dừng khẩn cấp trên robot.' },
  { key: 'previewChecked', label: 'Đã xem hình camera', hint: 'Hình rõ, đúng hướng.' },
]
export const NO_CONFIRMATION: StartConfirmation = { robotPlaced: false, areaClear: false, attendantPresent: false, previewChecked: false }
export const isConfirmed = (value: StartConfirmation) => CONFIRMATIONS.every(({ key }) => value[key])

/**
 * Assistance reasons in the operator's words: a short tag for lists, and what
 * the operator checks before choosing a recovery (scope §12.1–12.2).
 */
export const REASON_SHORT: Record<string, string> = {
  NavigationFailed: 'Lỗi điều hướng',
  RobotDisconnected: 'Mất kết nối robot',
  HeadFailure: 'Lỗi đầu xoay',
  StreamUnavailable: 'Mất nguồn livestream',
  CommandUnknown: 'Lệnh chưa rõ kết quả',
  BackendRestarted: 'Backend khởi động lại',
}

export const REASON_GUIDE: Record<string, string> = {
  NavigationFailed: 'Kiểm tra tại chỗ robot đã dừng và đường đi thông, rồi Thử lại chặng (mã chặng mới) hoặc Kết thúc sớm.',
  RobotDisconnected: 'Kiểm tra robot và mạng. Khi kết nối trở lại và robot đã dừng, Thử lại chặng; nếu không xác định được trạng thái thì Kết thúc sớm.',
  HeadFailure: 'Kiểm tra cơ cấu đầu xoay, rồi Thử lại FRONT (mã lệnh mới). Chặng kế chỉ được gửi sau khi FRONT hoàn tất.',
  StreamUnavailable: 'Chặng hiện tại vẫn chạy; robot sẽ đứng giữ khi tới POI. Sửa nguồn hình, rồi Chạy lại POI để bắt đầu lượt quan sát mới.',
  CommandUnknown: 'Đối chiếu trạng thái robot trước khi thử lại; không gửi lại lệnh mù.',
  BackendRestarted: 'Không tự tiếp tục sau khi backend khởi động lại. Kiểm tra robot tại chỗ rồi Kết thúc sớm.',
}

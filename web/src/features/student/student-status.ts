import type { StudentOperationalStep, TourState } from './student-types'

export type StatusTone = 'ok' | 'info' | 'warn' | 'danger' | 'muted'

export interface StudentStatusDisplay {
  label: string
  tone: StatusTone
  description?: string
  isInteractiveBlocked?: boolean
}

/**
 * Ánh xạ 11 nhãn trạng thái sinh động phía học sinh theo Mục 5.4 Scope
 */
export function getStudentStatusDisplay(
  step: StudentOperationalStep,
  poiTitle?: string,
  tourState?: TourState
): StudentStatusDisplay {
  // Ưu tiên trạng thái terminal
  if (tourState === 'Completed' || step === 'ended_completed') {
    return {
      label: 'Buổi đã hoàn thành',
      tone: 'ok',
      description: 'Cảm ơn bạn đã tham gia buổi tham quan trực tuyến!',
      isInteractiveBlocked: true,
    }
  }

  if (tourState === 'Cancelled' || step === 'ended_cancelled') {
    return {
      label: 'Buổi đã hủy',
      tone: 'danger',
      description: 'Buổi tham quan đã dừng. Vui lòng liên hệ đại diện trường.',
      isInteractiveBlocked: true,
    }
  }

  const targetPoi = poiTitle || 'Điểm tham quan'

  switch (step) {
    case 'scheduled_waiting':
      return {
        label: 'Đang chờ buổi tham quan bắt đầu',
        tone: 'info',
        description: 'Vui lòng kiểm tra thiết bị âm thanh trong lúc chờ.',
      }

    case 'roster_updating':
      return {
        label: 'Danh sách đang được cập nhật; giữ phòng chờ',
        tone: 'warn',
        description: 'Đại diện trường đang điều chỉnh danh sách đoàn. Quyền tham gia của bạn đang được xác thực lại.',
      }

    case 'navigating':
      return {
        label: `Đang di chuyển tới ${targetPoi}`,
        tone: 'info',
        description: 'Robot đang tự hành theo tuyến đường đã định.',
      }

    case 'preparing_head':
      return {
        label: `Đang chuẩn bị góc nhìn tại ${targetPoi}`,
        tone: 'info',
        description: 'Robot đã tới điểm dừng và đang điều chỉnh góc camera quan sát.',
      }

    case 'narration':
      return {
        label: `Đang giới thiệu ${targetPoi}`,
        tone: 'ok',
        description: 'Đang phát thuyết minh thông tin điểm đến.',
      }

    case 'holding':
      return {
        label: `Đang giữ để quan sát ${targetPoi}`,
        tone: 'warn',
        description: 'Vận hành viên đang giữ robot tại điểm để đoàn quan sát kỹ hơn.',
      }

    case 'preparing_move':
      return {
        label: 'Đang chuẩn bị di chuyển',
        tone: 'info',
        description: 'Robot đang đưa camera về phía trước để tiếp tục hành trình.',
      }

    case 'returning':
      return {
        label: 'Đang về điểm kết thúc',
        tone: 'info',
        description: 'Đã hoàn thành các điểm tham quan, robot đang di chuyển về vị trí kết thúc.',
      }

    case 'needs_assistance':
      return {
        label: 'Tạm gián đoạn; Staff đang hỗ trợ',
        tone: 'danger',
        description: 'Đường truyền hoặc trạng thái đang cần nhân viên hỗ trợ xử lý. Bạn vẫn có thể hỏi đáp cùng AI.',
      }

    case 'reconnecting':
      return {
        label: 'Đang kết nối lại; chưa biết trạng thái hiện tại',
        tone: 'warn',
        description: 'Tạm mất kết nối với hệ thống. Đang thử kết nối lại tự động...',
      }

    default:
      return {
        label: 'Đang diễn ra',
        tone: 'info',
      }
  }
}

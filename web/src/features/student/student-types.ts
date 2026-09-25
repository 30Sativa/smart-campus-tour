/**
 * Student Feature Types
 * CampusTour DT-AMR - Trải nghiệm học sinh tham quan từ xa
 */

export type TourState = 'Scheduled' | 'Ready' | 'Running' | 'Completed' | 'Cancelled'

export type RegistrationState = 'Submitted' | 'Approved' | 'Rejected' | 'Cancelled'

/**
 * 11 trạng thái sinh động phía học sinh theo Mục 5.4 của Scope
 */
export type StudentOperationalStep =
  | 'scheduled_waiting'      // Đang chờ buổi tham quan bắt đầu (SCHEDULED / READY)
  | 'roster_updating'        // Danh sách đang được cập nhật; giữ phòng chờ
  | 'navigating'             // Đang di chuyển tới [POI]
  | 'preparing_head'         // Đang chuẩn bị góc nhìn tại [POI]
  | 'narration'              // Đang giới thiệu [POI]
  | 'holding'                // Đang giữ để quan sát [POI]
  | 'preparing_move'         // Đang chuẩn bị di chuyển (FRONT)
  | 'returning'              // Đang về điểm kết thúc
  | 'needs_assistance'       // Tạm gián đoạn; Staff đang hỗ trợ
  | 'reconnecting'           // Đang kết nối lại; chưa biết trạng thái hiện tại
  | 'ended_completed'        // Buổi đã hoàn thành
  | 'ended_cancelled'        // Buổi đã hủy

export interface PoiDetail {
  id: string
  title: string
  order: number
  x: number // Map coordinate 0-100%
  y: number // Map coordinate 0-100%
  description: string
  audioUrl?: string
  dwellSeconds?: number
}

export interface StudentRobotPose {
  x: number // Map coordinate 0-100%
  y: number // Map coordinate 0-100%
  heading: number // Degrees 0-360
  isStale: boolean
  lastUpdatedAt: string
}

export interface StudentTourSnapshot {
  tourId: string
  tourName: string
  scheduledAt: string
  tourState: TourState
  schoolName: string
  groupCode: string
  registrationState: RegistrationState
  currentPoi?: PoiDetail
  nextPoi?: PoiDetail
  pois: PoiDetail[]
  robotPose: StudentRobotPose
  step: StudentOperationalStep
  videoStreamUrl: string
  narration?: {
    poiId: string
    title: string
    text: string
    audioUrl?: string
    isPlaying: boolean
  }
  rejectionReason?: string
  cancelReason?: string
}

export interface StudentSession {
  tourId: string
  groupCode: string
  studentName: string
  studentClass?: string
  sessionToken: string
  joinedAt: string
}

export interface RosterItem {
  hoTen: string
  lop?: string
}

export interface RosterMatchRequest {
  tourId: string
  groupCode: string
  hoTen: string
  lop?: string
}

export interface AiChatMessage {
  id: string
  sender: 'student' | 'ai'
  text: string
  timestamp: string
  poiContext?: string
  status?: 'sending' | 'sent' | 'error'
  isAudioPlaying?: boolean
}

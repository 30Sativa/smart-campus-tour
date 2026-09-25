import type {
  PoiDetail,
  RosterItem,
  RosterMatchRequest,
  StudentTourSnapshot,
  TourState,
  RegistrationState,
} from '../features/student/student-types'
import { matchStudentInRoster } from '../features/student/student-matching'

export interface MockTourData {
  tourId: string
  tourName: string
  scheduledAt: string
  tourState: TourState
  schoolName: string
  groupCode: string
  registrationState: RegistrationState
  roster: RosterItem[]
  pois: PoiDetail[]
  currentPoiIndex: number
  robotPose: {
    x: number
    y: number
    heading: number
    isStale: boolean
    lastUpdatedAt: string
  }
  videoStreamUrl: string
}

export const MOCK_POIS: PoiDetail[] = [
  {
    id: 'poi-gate',
    title: 'Cổng chính & Quảng trường Khát Vọng',
    order: 1,
    x: 20,
    y: 80,
    description: 'Biểu tượng chào đón các tân sinh viên và du khách với kiến trúc vòm xanh tương lai.',
    dwellSeconds: 45,
  },
  {
    id: 'poi-lib',
    title: 'Thư viện Thông minh & Không gian Sáng chế',
    order: 2,
    x: 50,
    y: 45,
    description: 'Không gian học tập đa phương tiện 4 tầng với robot hỗ trợ tìm sách và xưởng in 3D.',
    dwellSeconds: 60,
  },
  {
    id: 'poi-admin',
    title: 'Khu liên hợp Khoa học & Nhà Điều hành',
    order: 3,
    x: 80,
    y: 25,
    description: 'Trung tâm nghiên cứu trí tuệ nhân tạo và hội trường đa năng sức chứa 1.000 chỗ.',
    dwellSeconds: 50,
  },
]

export const MOCK_STUDENT_TOURS: MockTourData[] = [
  {
    tourId: 'tour-101',
    tourName: 'Tham quan Trải nghiệm Trực tuyến Đại học Sáng tạo',
    scheduledAt: '14:30',
    tourState: 'Running',
    schoolName: 'Trường THPT Chuyên Lê Hồng Phong',
    groupCode: 'LHP2026',
    registrationState: 'Approved',
    roster: [
      { hoTen: 'Nguyễn Văn An', lop: '12A1' },
      { hoTen: 'Trần Thị Mai', lop: '12A1' },
      { hoTen: 'Lê Hoàng Nam', lop: '12A2' },
      { hoTen: 'Phạm Minh Tuấn', lop: '11B1' },
      { hoTen: 'Võ Quốc Bảo' }, // Không lớp
    ],
    pois: MOCK_POIS,
    currentPoiIndex: 1, // Đang ở Thư viện
    robotPose: {
      x: 48,
      y: 46,
      heading: 65,
      isStale: false,
      lastUpdatedAt: new Date().toISOString(),
    },
    videoStreamUrl: '/videos/home.mp4',
  },
  {
    tourId: 'tour-102',
    tourName: 'Khám phá Công nghệ Robot & Tự động hóa Campus',
    scheduledAt: '16:00',
    tourState: 'Scheduled',
    schoolName: 'Trường THPT Gia Định',
    groupCode: 'GD2026',
    registrationState: 'Approved',
    roster: [
      { hoTen: 'Nguyễn Thị Hương', lop: '10C1' },
      { hoTen: 'Đỗ Anh Đức', lop: '10C1' },
      { hoTen: 'Hoàng Minh Khôi', lop: '10C2' },
    ],
    pois: MOCK_POIS,
    currentPoiIndex: 0,
    robotPose: {
      x: 18,
      y: 82,
      heading: 0,
      isStale: false,
      lastUpdatedAt: new Date().toISOString(),
    },
    videoStreamUrl: '/videos/home.mp4',
  },
  {
    tourId: 'tour-103',
    tourName: 'Hành trình Cơ sở Vật chất & Đời sống Sinh viên',
    scheduledAt: '10:00',
    tourState: 'Completed',
    schoolName: 'Trường THPT Nguyễn Thị Minh Khai',
    groupCode: 'NTMK2026',
    registrationState: 'Approved',
    roster: [{ hoTen: 'Phan Bảo Trâm', lop: '12D1' }],
    pois: MOCK_POIS,
    currentPoiIndex: 2,
    robotPose: {
      x: 82,
      y: 22,
      heading: 180,
      isStale: false,
      lastUpdatedAt: new Date().toISOString(),
    },
    videoStreamUrl: '',
  },
]

export function mockFindTour(tourId?: string, groupCode?: string): MockTourData | undefined {
  if (tourId) {
    const byId = MOCK_STUDENT_TOURS.find((t) => t.tourId === tourId)
    if (byId) return byId
  }
  if (groupCode) {
    const byCode = MOCK_STUDENT_TOURS.find(
      (t) => t.groupCode.toLowerCase() === groupCode.toLowerCase().trim()
    )
    if (byCode) return byCode
  }
  // Mặc định fallback về tour-101 nếu mở link chung /tour
  return MOCK_STUDENT_TOURS[0]
}

export function mockMatchStudentRequest(req: RosterMatchRequest) {
  const tour = mockFindTour(req.tourId, req.groupCode)
  if (!tour) {
    return {
      success: false,
      errorMessage: 'Không tìm thấy buổi tham quan tương ứng với mã đoàn này.',
    }
  }

  if (tour.tourState === 'Completed' || tour.tourState === 'Cancelled') {
    return {
      success: false,
      errorMessage: 'Buổi tham quan đã kết thúc hoặc đã bị hủy. Không cấp phiên truy cập mới.',
    }
  }

  // Đối chiếu mã đoàn
  if (tour.groupCode.toLowerCase() !== req.groupCode.toLowerCase().trim()) {
    return {
      success: false,
      errorMessage: 'Không thể xác nhận quyền tham gia. Vui lòng liên hệ đại diện.',
    }
  }

  // Đối chiếu danh sách học sinh
  const matchResult = matchStudentInRoster(req.hoTen, req.lop, tour.roster)
  if (!matchResult.isMatch) {
    return {
      success: false,
      errorMessage: matchResult.errorMessage,
    }
  }

  // Cấp session
  return {
    success: true,
    session: {
      tourId: tour.tourId,
      groupCode: tour.groupCode,
      studentName: matchResult.matchedItem!.hoTen,
      studentClass: matchResult.matchedItem!.lop,
      sessionToken: `st_token_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      joinedAt: new Date().toISOString(),
    },
  }
}

export function mockGetStudentSnapshot(tourId: string): StudentTourSnapshot {
  const tour = mockFindTour(tourId) || MOCK_STUDENT_TOURS[0]
  const currentPoi = tour.pois[tour.currentPoiIndex]
  const nextPoi = tour.pois[tour.currentPoiIndex + 1]

  let step: StudentTourSnapshot['step']
  if (tour.tourState === 'Scheduled' || tour.tourState === 'Ready') {
    step = 'scheduled_waiting'
  } else if (tour.tourState === 'Completed') {
    step = 'ended_completed'
  } else if (tour.tourState === 'Cancelled') {
    step = 'ended_cancelled'
  } else {
    // Running
    step = 'narration'
  }

  return {
    tourId: tour.tourId,
    tourName: tour.tourName,
    scheduledAt: tour.scheduledAt,
    tourState: tour.tourState,
    schoolName: tour.schoolName,
    groupCode: tour.groupCode,
    registrationState: tour.registrationState,
    currentPoi,
    nextPoi,
    pois: tour.pois,
    robotPose: tour.robotPose,
    step,
    videoStreamUrl: tour.videoStreamUrl,
    narration:
      tour.tourState === 'Running' && currentPoi
        ? {
            poiId: currentPoi.id,
            title: currentPoi.title,
            text: `Chào mừng các bạn học sinh đến với ${currentPoi.title}! ${currentPoi.description} Đây là một trong những điểm nhấn quan trọng nhất trong hành trình trải nghiệm ngày hôm nay.`,
            isPlaying: true,
          }
        : undefined,
  }
}

export async function mockAskAiResponse(question: string, poiContext?: string): Promise<string> {
  // Simulate delay
  await new Promise((resolve) => setTimeout(resolve, 800))

  const cleanQ = question.toLowerCase()
  if (cleanQ.includes('mấy tầng') || cleanQ.includes('diện tích') || cleanQ.includes('sách')) {
    return `Thư viện Thông minh của trường có 4 tầng rộng hơn 3.200m², trang bị hơn 50.000 đầu sách chuyên khảo và hệ thống trạm mượn trả sách tự động tích hợp thẻ sinh viên thông minh nhé!`
  }
  if (cleanQ.includes('học bổng') || cleanQ.includes('tuyển sinh') || cleanQ.includes('ngành')) {
    return `Trường có các chính sách học bổng từ 30% đến 100% học phí dành riêng cho học sinh các trường THPT có thành tích xuất sắc. Bạn có thể tham khảo thêm tại cổng thông tin tuyển sinh chính thức!`
  }
  if (cleanQ.includes('robot') || cleanQ.includes('amr') || cleanQ.includes('tự hành')) {
    return `Robot bạn đang thấy dẫn đường là Robot AMR tự hành của trường, sử dụng cảm biến LiDAR và thuật toán SLAM ROS 2 để lập bản đồ và dẫn đường tự động không cần đường ray!`
  }

  return `Chào bạn! Về câu hỏi "${question}" tại khu vực ${poiContext || 'khuôn viên'}: Đây là một điểm rất đặc biệt của trường. Khu vực này luôn mở cửa phục vụ sinh viên từ 7:30 đến 21:00 các ngày trong tuần.`
}

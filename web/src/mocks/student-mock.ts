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
    imageUrl: '/images/student-poi/gate.webp',
    title: 'Cổng chính & Quảng trường Khát Vọng',
    order: 1,
    x: 20,
    y: 80,
    description: 'Biểu tượng chào đón các tân sinh viên và du khách với kiến trúc vòm xanh tương lai.',
    dwellSeconds: 45,
  },
  {
    id: 'poi-lib',
    imageUrl: '/images/student-poi/library.webp',
    title: 'Thư viện Thông minh & Không gian Sáng chế',
    order: 2,
    x: 50,
    y: 45,
    description: 'Không gian học tập đa phương tiện 4 tầng với robot hỗ trợ tìm sách và xưởng in 3D.',
    dwellSeconds: 60,
  },
  {
    id: 'poi-admin',
    imageUrl: '/images/student-poi/lab.webp',
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

/** Prefix on every simulated answer so the labelled demo is never mistaken for the real assistant. */
export const DEMO_ANSWER_PREFIX = '(Câu trả lời mẫu của phiên demo, chưa dùng AI thật) '

/**
 * Simulated answers for the labelled demo Tour only. The invited live page calls the real assistant
 * (docs/architecture.md §7.1). Topics are checked most-specific first so "chính sách học bổng" is not
 * mistaken for a library question about "sách".
 */
export async function mockAskAiResponse(question: string, poiContext?: string): Promise<string> {
  // Simulate delay
  await new Promise((resolve) => setTimeout(resolve, 800))

  const q = question.toLowerCase()
  const has = (...words: string[]) => words.some((w) => q.includes(w))
  if (has('học bổng', 'học phí', 'tuyển sinh', 'ngành', 'điểm chuẩn')) {
    return DEMO_ANSWER_PREFIX +
      'Phiên demo chưa có dữ liệu tuyển sinh hay học bổng. Ở buổi tham quan thật, trợ lý chỉ trả lời theo nội dung nhà trường đã duyệt; thông tin tuyển sinh chính thức bạn xem trên trang của trường nhé.'
  }
  if (has('robot', 'amr', 'tự hành', 'lidar', 'cảm biến')) {
    return DEMO_ANSWER_PREFIX +
      'Robot dẫn đường là robot di động tự hành (AMR), dùng cảm biến LiDAR làm chính và chạy phần mềm ROS 2 với Nav2 để tự đi theo tuyến đã chuẩn bị.'
  }
  if (has('thư viện', 'mấy tầng', 'diện tích', 'đầu sách')) {
    return DEMO_ANSWER_PREFIX +
      'Thư viện Thông minh trong phiên demo là điểm tham quan minh họa; số liệu thật của thư viện sẽ có khi nhà trường duyệt nội dung cho buổi tham quan.'
  }
  return DEMO_ANSWER_PREFIX +
    `Bạn vừa hỏi về khu vực ${poiContext || 'khuôn viên'}. Phiên demo chỉ có vài câu trả lời minh họa; ở buổi tham quan thật trợ lý sẽ trả lời theo nội dung đã duyệt hoặc nói rõ khi chưa có thông tin.`
}

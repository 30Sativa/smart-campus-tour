/**
 * All visible copy for the public landing page.
 *
 * Kept in one module so the wording can be edited without touching layout or
 * motion code. Copy rules for this page: plain functional Vietnamese, no
 * em dashes, no invented precision, and the top of the page speaks about the
 * visit rather than about the stack. ROS 2, LiDAR and the API names only
 * appear from `railItems` downward.
 */

/**
 * Where the primary "Trải nghiệm Campus Tour" action goes.
 *
 * The visitor booking route was removed from the app on 2026-09-16, so sign in
 * is currently the only door into the product. When a public booking route
 * ships, change this one constant and both the hero and the closing band follow.
 */
export const EXPERIENCE_HREF = '/login'

/** Live operations view behind the staff guard. */
export const OPERATIONS_DEMO_HREF = '/admin/digital-twin'

export type JourneyStep = {
  id: string
  step: string
  title: string
  body: string
  image: string
  alt: string
}

export const journeySteps: JourneyStep[] = [
  {
    id: 'chon-tour',
    step: '01',
    title: 'Chọn tour',
    body: 'Khách chọn lộ trình, giờ bắt đầu và số người. Hệ thống tự phân bổ robot còn rảnh cho nhóm đó.',
    image: '/images/booking-app.jpg',
    alt: 'Màn hình đặt tour trên điện thoại với lộ trình và khung giờ trống',
  },
  {
    id: 'dan-duong',
    step: '02',
    title: 'Robot bắt đầu dẫn đường',
    body: 'Robot nhận lộ trình, tự tìm đường giữa người đi bộ và giữ tốc độ đi bộ cho cả nhóm.',
    image: '/images/hero-campus.jpg',
    alt: 'Robot AMR dẫn một nhóm khách đi trên lối đi trong khuôn viên lúc chiều tối',
  },
  {
    id: 'thuyet-minh',
    step: '03',
    title: 'AI thuyết minh tại từng điểm',
    body: 'Tới mỗi điểm dừng, trợ lý AI giới thiệu bằng giọng nói và trả lời câu hỏi theo ngôn ngữ khách chọn.',
    image: '/images/ai-assistant.jpg',
    alt: 'Máy tính bảng hiển thị trợ lý AI đang nghe và trả lời câu hỏi của khách',
  },
  {
    id: 'ket-thuc',
    step: '04',
    title: 'Hoàn thành hành trình',
    body: 'Robot đưa khách về điểm kết thúc rồi tự quay lại trạm sạc. Cả hành trình được ghi lại trên hệ thống.',
    image: '/images/digital-twin.jpg',
    alt: 'Bản đồ số của khuôn viên hiển thị lộ trình robot vừa đi qua',
  },
]

export type Capability = {
  id: string
  name: string
  desc: string
  image: string
  alt: string
}

export const capabilities: Capability[] = [
  {
    id: 'amr',
    name: 'Robot tự hành AMR',
    desc: 'Robot tự tìm đường trong khuôn viên, tránh vật cản và người đi bộ, bám đúng lộ trình đã đặt rồi quay về trạm sạc khi pin thấp.',
    image: '/images/hero-campus.jpg',
    alt: 'Robot AMR đang di chuyển trên lối đi trong khuôn viên',
  },
  {
    id: 'booking',
    name: 'Đặt lịch và lên lộ trình',
    desc: 'Khách đặt tour qua web app. Hệ thống tự lên lịch, chọn robot phù hợp và báo lại trạng thái chuyến đi theo thời gian thực.',
    image: '/images/booking-app.jpg',
    alt: 'Giao diện đặt lịch tour hiển thị khung giờ và lộ trình',
  },
  {
    id: 'ai',
    name: 'Trợ lý AI đa ngôn ngữ',
    desc: 'Thuyết minh điểm tham quan và trả lời câu hỏi bằng giọng nói, hỗ trợ tiếng Việt, tiếng Anh và nhiều ngôn ngữ khác.',
    image: '/images/ai-assistant.jpg',
    alt: 'Trợ lý AI hiển thị sóng âm khi đang lắng nghe',
  },
  {
    id: 'digital-twin',
    name: 'Digital Twin thời gian thực',
    desc: 'Bản sao số của khuôn viên bám theo vị trí từng robot, để đội vận hành nhìn thấy mọi chuyến đang chạy trên cùng một bản đồ.',
    image: '/images/digital-twin.jpg',
    alt: 'Bản đồ Digital Twin dạng lưới 3D của khuôn viên đại học',
  },
  {
    id: 'ops',
    name: 'Bảng điều khiển vận hành',
    desc: 'Trạng thái pin, lịch tour, cảnh báo sự cố và số liệu hiệu suất nằm chung một màn hình cho người trực ca.',
    image: '/images/digital-twin.jpg',
    alt: 'Bảng điều khiển vận hành hiển thị trạng thái đội robot',
  },
]

/**
 * Capability strip under the hero. One abstraction level only: what the system
 * does for a visitor or an operator. Framework and sensor names belong to the
 * technology sections further down.
 */
export const marqueeItems: string[] = [
  'Đặt tour trực tuyến',
  'Robot tự dẫn đường',
  'AI thuyết minh',
  'Theo dõi thời gian thực',
  'Điều phối đội robot',
  'Digital Twin',
]

export type Metric = {
  id: string
  value: number
  suffix?: string
  accentSuffix?: string
  label: string
  note: string
}

export const metrics: Metric[] = [
  {
    id: 's1',
    value: 500,
    suffix: '+',
    label: 'Lượt tham quan',
    note: 'Mỗi tháng, trong giờ mở cửa của khuôn viên',
  },
  {
    id: 's2',
    value: 15,
    suffix: '+',
    label: 'Điểm dừng',
    note: 'Toà nhà, phòng lab, thư viện và công viên',
  },
  {
    id: 's3',
    value: 5,
    label: 'Ngôn ngữ',
    note: 'Việt, Anh, Pháp, Nhật, Hàn',
  },
  {
    id: 's4',
    value: 99,
    accentSuffix: '%',
    label: 'Thời gian hệ thống hoạt động',
    note: 'Giám sát và phục hồi tự động khi có sự cố',
  },
]

export type RailItem = {
  id: string
  title: string
  body: string
  image: string
  alt: string
}

export const railItems: RailItem[] = [
  {
    id: 'navigation',
    title: 'Điều hướng tự hành',
    body: 'Robot tự dựng bản đồ khuôn viên rồi tính đường đi tối ưu bằng SLAM, Nav2 và costmap.',
    image: '/images/hero-campus.jpg',
    alt: 'Robot AMR điều hướng trên lối đi trong khuôn viên',
  },
  {
    id: 'digital-twin',
    title: 'Bản sao kỹ thuật số',
    body: 'Trạng thái robot và môi trường được đồng bộ liên tục về bản đồ 3D trong lúc tour chạy.',
    image: '/images/digital-twin.jpg',
    alt: 'Mô hình Digital Twin của khuôn viên với vị trí robot',
  },
  {
    id: 'ai',
    title: 'Trò chuyện bằng giọng nói',
    body: 'Robot nghe câu hỏi, tra cứu thông tin khuôn viên rồi trả lời lại bằng ngôn ngữ khách chọn.',
    image: '/images/ai-assistant.jpg',
    alt: 'Giao diện trợ lý AI đang xử lý giọng nói',
  },
  {
    id: 'booking',
    title: 'Đặt tour và điều phối',
    body: 'Hệ thống nhận yêu cầu đặt tour, chọn robot phù hợp và quản lý hàng đợi cho cả ngày.',
    image: '/images/booking-app.jpg',
    alt: 'Ứng dụng đặt lịch tour hiển thị khung giờ trống',
  },
  {
    id: 'operations',
    title: 'Vận hành đội robot',
    body: 'Pin, cảnh báo và số liệu hiệu suất của toàn đội tập trung về một bảng điều khiển.',
    image: '/images/digital-twin.jpg',
    alt: 'Màn hình vận hành theo dõi trạng thái đội robot',
  },
]

export type PlatformPillar = {
  id: string
  icon: 'cpu' | 'radar' | 'server' | 'layout'
  title: string
  /** What this buys the visitor or the operator, in plain language. */
  benefit: string
  /** The actual stack, for the reader who came looking for it. */
  stack: string[]
}

export const platformPillars: PlatformPillar[] = [
  {
    id: 'ros',
    icon: 'radar',
    title: 'Điều hướng thông minh',
    benefit: 'Robot di chuyển ổn định và tránh vật cản trong khuôn viên.',
    stack: ['ROS 2', 'Nav2', 'SLAM Toolbox', 'AMCL'],
  },
  {
    id: 'ai',
    icon: 'cpu',
    title: 'Trò chuyện đa ngôn ngữ',
    benefit: 'Robot nghe, hiểu và trả lời khách bằng giọng nói tự nhiên.',
    stack: ['STT', 'Tri thức khuôn viên', 'LLM hội thoại', 'TTS'],
  },
  {
    id: 'backend',
    icon: 'server',
    title: 'Đặt tour và điều phối',
    benefit: 'Nhận đặt tour, phân bổ robot và cập nhật trạng thái tức thì.',
    stack: ['ASP.NET Core', 'MediatR', 'EF Core', 'SignalR'],
  },
  {
    id: 'frontend',
    icon: 'layout',
    title: 'Ứng dụng và bảng điều khiển',
    benefit: 'Một giao diện cho khách đặt tour, một cho đội vận hành theo dõi.',
    stack: ['React', 'TypeScript', 'Vite', 'Three.js'],
  },
]

/** Nav order follows the order the sections appear on the page. */
export const navLinks = [
  { href: '#quy-trinh', label: 'Hành trình' },
  { href: '#tinh-nang', label: 'Tính năng' },
  { href: '#gioi-thieu', label: 'Digital Twin' },
  { href: '#robot', label: 'Công nghệ' },
  { href: '#lien-he', label: 'Liên hệ' },
]

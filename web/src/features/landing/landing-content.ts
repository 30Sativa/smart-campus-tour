/**
 * All visible copy for the public landing page.
 *
 * Kept in one module so the wording can be edited without touching layout or
 * motion code. Copy rule for this page: plain functional Vietnamese, no
 * em dashes, no invented precision. The numbers in `metrics` are the project's
 * stated operating targets, which is how the section labels them.
 */

export type JourneyStep = {
  id: string
  title: string
  body: string
  image: string
  alt: string
}

export const journeySteps: JourneyStep[] = [
  {
    id: 'dat-lich',
    title: 'Đặt lịch trực tuyến',
    body: 'Chọn lộ trình, giờ đến và số người. Hệ thống tự phân bổ robot phù hợp cho từng nhóm khách.',
    image: '/images/booking-app.jpg',
    alt: 'Màn hình ứng dụng đặt lịch tham quan trên điện thoại',
  },
  {
    id: 'dan-duong',
    title: 'Robot tự hành dẫn đường',
    body: 'Robot điều hướng chính xác, tránh vật cản và đưa khách tới từng điểm tham quan.',
    image: '/images/hero-campus.jpg',
    alt: 'Robot AMR dẫn một nhóm khách đi trong khuôn viên đại học lúc chiều tối',
  },
  {
    id: 'kham-pha',
    title: 'AI thuyết minh đa ngôn ngữ',
    body: 'Trợ lý AI giới thiệu điểm đến và trả lời câu hỏi bằng tiếng Việt, tiếng Anh và nhiều ngôn ngữ khác.',
    image: '/images/ai-assistant.jpg',
    alt: 'Máy tính bảng hiển thị trợ lý AI đang nghe và trả lời câu hỏi',
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
    desc: 'Robot di động tự hành dùng ROS 2, LiDAR và camera RGB-D để điều hướng an toàn trong khuôn viên. Tự tránh vật cản, bám lộ trình và quay về trạm sạc khi pin thấp.',
    image: '/images/hero-campus.jpg',
    alt: 'Robot AMR đang di chuyển trên lối đi trong khuôn viên',
  },
  {
    id: 'booking',
    name: 'Đặt lịch và lên lộ trình',
    desc: 'Khách tham quan đặt tour qua web app. Backend tự lên lịch, phân bổ robot phù hợp và gửi thông báo thời gian thực về trạng thái chuyến tour.',
    image: '/images/booking-app.jpg',
    alt: 'Giao diện đặt lịch tour hiển thị khung giờ và lộ trình',
  },
  {
    id: 'ai',
    name: 'Trợ lý AI đa ngôn ngữ',
    desc: 'Trợ lý tích hợp STT, LLM và TTS hỗ trợ tiếng Việt, tiếng Anh và nhiều ngôn ngữ khác. Thuyết minh điểm tham quan và trả lời câu hỏi tức thì bằng giọng nói.',
    image: '/images/ai-assistant.jpg',
    alt: 'Trợ lý AI hiển thị sóng âm khi đang lắng nghe',
  },
  {
    id: 'digital-twin',
    name: 'Digital Twin thời gian thực',
    desc: 'Bản sao kỹ thuật số của khuôn viên đồng bộ liên tục với vị trí robot. Đội vận hành theo dõi toàn bộ đội robot, quản lý lịch trình và phát hiện sự cố ngay khi xảy ra.',
    image: '/images/digital-twin.jpg',
    alt: 'Bản đồ Digital Twin dạng lưới 3D của khuôn viên đại học',
  },
  {
    id: 'ops',
    name: 'Bảng điều khiển vận hành',
    desc: 'Dashboard theo dõi trạng thái pin, lịch tour, cảnh báo sự cố và số liệu hiệu suất trong một giao diện duy nhất.',
    image: '/images/digital-twin.jpg',
    alt: 'Bảng điều khiển vận hành hiển thị vị trí và trạng thái đội robot',
  },
]

export const marqueeItems: string[] = [
  'Robot AMR tự hành',
  'Trợ lý AI đa ngôn ngữ',
  'Digital Twin thời gian thực',
  'Đặt tour trực tuyến',
  'Giám sát đội robot',
  'Navigation ROS 2',
  'LiDAR và camera RGB-D',
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
    label: 'Lượt tham quan mỗi tháng',
    note: 'Đội robot phục vụ liên tục trong giờ mở cửa',
  },
  {
    id: 's2',
    value: 15,
    suffix: '+',
    label: 'Điểm tham quan',
    note: 'Toà nhà, phòng lab, thư viện và công viên',
  },
  {
    id: 's3',
    value: 5,
    label: 'Ngôn ngữ hỗ trợ',
    note: 'Việt, Anh, Pháp, Nhật, Hàn',
  },
  {
    id: 's4',
    value: 99,
    accentSuffix: '%',
    label: 'Thời gian hệ thống sẵn sàng',
    note: 'Giám sát và phục hồi tự động',
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
    title: 'Điều hướng tự hành ROS 2',
    body: 'SLAM, Nav2 và costmap. Robot tự dựng bản đồ rồi tính đường đi tối ưu.',
    image: '/images/hero-campus.jpg',
    alt: 'Robot AMR điều hướng trên lối đi trong khuôn viên',
  },
  {
    id: 'digital-twin',
    title: 'Bản sao kỹ thuật số',
    body: 'Đồng bộ trạng thái robot và môi trường theo thời gian thực qua ROS Bridge.',
    image: '/images/digital-twin.jpg',
    alt: 'Mô hình Digital Twin của khuôn viên với vị trí robot',
  },
  {
    id: 'ai',
    title: 'Chuỗi xử lý giọng nói',
    body: 'Whisper STT, LLM hội thoại rồi TTS. Trả lời tự nhiên bằng nhiều ngôn ngữ.',
    image: '/images/ai-assistant.jpg',
    alt: 'Giao diện trợ lý AI đang xử lý giọng nói',
  },
  {
    id: 'booking',
    title: 'API đặt lịch và điều phối',
    body: 'FastAPI phân bổ tour, điều phối đội robot và quản lý hàng đợi tự động.',
    image: '/images/booking-app.jpg',
    alt: 'Ứng dụng đặt lịch tour hiển thị khung giờ trống',
  },
  {
    id: 'operations',
    title: 'Vận hành đội robot',
    body: 'Theo dõi pin, cảnh báo và số liệu hiệu suất của toàn đội từ một nơi.',
    image: '/images/digital-twin.jpg',
    alt: 'Màn hình vận hành theo dõi trạng thái đội robot',
  },
]

export type PlatformPillar = {
  id: string
  icon: 'cpu' | 'radar' | 'server' | 'layout'
  title: string
  sub: string
}

export const platformPillars: PlatformPillar[] = [
  {
    id: 'ros',
    icon: 'radar',
    title: 'Navigation stack',
    sub: 'ROS 2 Humble, Nav2, SLAM Toolbox, MoveIt 2',
  },
  {
    id: 'ai',
    icon: 'cpu',
    title: 'Chuỗi xử lý đa ngôn ngữ',
    sub: 'Whisper STT, LLM hội thoại, Coqui TTS',
  },
  {
    id: 'backend',
    icon: 'server',
    title: 'Booking và dispatch API',
    sub: 'FastAPI, PostgreSQL, Redis, AWS EC2',
  },
  {
    id: 'frontend',
    icon: 'layout',
    title: 'Web app và dashboard',
    sub: 'React, TypeScript, Vite, Three.js',
  },
]

export const navLinks = [
  { href: '#gioi-thieu', label: 'Giới thiệu' },
  { href: '#tinh-nang', label: 'Tính năng' },
  { href: '#quy-trinh', label: 'Quy trình' },
  { href: '#robot', label: 'Robot AMR' },
  { href: '#lien-he', label: 'Liên hệ' },
]

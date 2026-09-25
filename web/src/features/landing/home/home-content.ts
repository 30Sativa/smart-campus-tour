/**
 * Visible copy for the public home page (layout modelled on the Himon template).
 *
 * Source of truth for the product claims: the remote-tour scope of 19/09/2026.
 * Figures on this page are the demo targets from that scope (>= 3 POI, about
 * 30 minutes, one shared stream), not measured results. Change them here if the
 * team moves the threshold.
 */

export type NavLink = { href: string; label: string }

/** Nav order follows the order the sections appear on the page. */
export const homeNavLinks: NavLink[] = [
  { href: '#trai-nghiem', label: 'Trải nghiệm' },
  { href: '#giai-phap', label: 'Giải pháp' },
  { href: '#quy-trinh', label: 'Quy trình' },
  { href: '#robot', label: 'Robot' },
  { href: '#hoi-dap', label: 'Hỏi đáp' },
]

export const heroMeta = [
  { value: '≥ 3', label: 'Điểm tham quan' },
  { value: '≈ 30 phút', label: 'Mỗi buổi' },
  { value: '0', label: 'Tài khoản cần tạo' },
]

export type IntroStat = { id: string; value: number; prefix?: string; unit: string; note: string }

export const introStats: IntroStat[] = [
  {
    id: 'poi',
    value: 3,
    prefix: '≥ ',
    unit: ' POI',
    note: 'Mục tiêu demo: ít nhất ba điểm tham quan ở vị trí phân biệt, với ít nhất hai chặng navigation thật giữa các điểm.',
  },
  {
    id: 'stream',
    value: 1,
    unit: ' luồng',
    note: 'Một livestream chung cho mọi đoàn. Tất cả cùng xem hướng camera hiện tại, không ai phải điều khiển robot.',
  },
  {
    id: 'duration',
    value: 30,
    prefix: '≈ ',
    unit: '′',
    note: 'Thời lượng một buổi khoảng 30 phút trở xuống, gồm di chuyển, thuyết minh và thời gian quan sát tại từng điểm.',
  },
]

export type Service = { id: string; title: string; body: string; tags: string[]; image: string; alt: string }

export const services: Service[] = [
  {
    id: 'livestream',
    title: 'Tham quan qua livestream',
    body: 'Học sinh mở đường link, nhập mã đoàn cùng họ tên và lớp, chờ trong phòng chờ rồi cùng xem một luồng hình trực tiếp từ robot. Không cần VR, không cần cài ứng dụng.',
    tags: ['Phòng chờ', 'Một góc nhìn chung', 'Trình duyệt web'],
    image: '/images/autonomous robot.avif',
    alt: 'Các robot tự hành trên sân trường',
  },
  {
    id: 'navigation',
    title: 'Robot tự hành qua các POI',
    body: 'Robot nhận từng chặng từ backend, tự tìm đường bằng ROS 2 và Nav2, tránh vật cản, dừng đúng điểm rồi chuyển sang chặng kế khi hết thời gian dừng. Staff chỉ can thiệp khi cần.',
    tags: ['ROS 2 · Nav2', 'Dừng an toàn cục bộ', 'Về điểm kết thúc'],
    image: '/images/robot.avif',
    alt: 'Robot tự hành trên vỉa hè cạnh khu vui chơi',
  },
  {
    id: 'head',
    title: 'Góc nhìn trên giá xoay',
    body: 'Nguồn hình (ưu tiên Quest 3, dự phòng camera RGB/UVC) đặt trên giá in 3D có motor. Tại mỗi POI, đầu xoay trái, phải theo các góc đã cấu hình; khi rời điểm luôn quay về hướng trước.',
    tags: ['Pan trái / phải', 'FRONT khi di chuyển', 'Gá in 3D'],
    image: '/images/tro-chuyen.avif',
    alt: 'Mô hình phần cứng giá xoay với dây nối và cảm biến',
  },
  {
    id: 'ai',
    title: 'Thuyết minh và hỏi AI riêng',
    body: 'Audio soạn sẵn cho từng điểm tự phát trên web khi robot tới nơi. Mỗi học sinh có thể hỏi trợ lý AI bằng chữ hoặc giọng nói, câu trả lời chỉ gửi về đúng trình duyệt của em đó.',
    tags: ['Audio theo POI', 'Text → TTS → STT', 'Một ngôn ngữ'],
    image: '/images/images.jpg',
    alt: 'Biểu tượng trợ lý AI trên điện thoại với sóng âm',
  },
  {
    id: 'map',
    title: 'Bản đồ 2D và Digital Twin',
    body: 'Học sinh theo dõi vị trí robot trên bản đồ 2D. Staff vận hành trên Twin 3D đơn giản. Cả hai dùng chung một nguồn pose từ robot nên luôn khớp nhau.',
    tags: ['Map 2D', 'Twin 3D cho Staff', 'Cùng nguồn pose'],
    image: '/images/digital-twin.jpg',
    alt: 'Bản đồ số 3D của khuôn viên đại học',
  },
]

export type SolutionCard = {
  id: string
  title: string
  body: string
  graphic: 'ellipses' | 'ripple' | 'pan' | 'grid'
  light?: boolean
}

export const solutionCards: SolutionCard[] = [
  {
    id: 'orchestration',
    title: 'Điều phối tự động theo tuyến',
    body: 'Backend giữ luồng tour: tới POI, dừng, xoay góc, thuyết minh, hết thời gian dừng thì tự sang chặng kế.',
    graphic: 'ellipses',
  },
  {
    id: 'realtime',
    title: 'Trạng thái minh bạch, thời gian thực',
    body: 'Pose robot, POI hiện tại và trạng thái phiên được đẩy qua SignalR tới map của học sinh và Twin của Staff.',
    graphic: 'ripple',
  },
  {
    id: 'pan',
    title: 'Góc nhìn xoay trái, phải',
    body: 'Backend yêu cầu lần lượt từng góc và thời gian giữ. Controller chỉ thực thi góc hiện tại và báo kết quả.',
    graphic: 'pan',
    light: true,
  },
  {
    id: 'simulation',
    title: 'Kiểm chứng bằng mô phỏng',
    body: 'Gazebo và fleet emulator chạy song song từ đầu để thử contract và đo tải, không phải chờ robot thật.',
    graphic: 'grid',
  },
]

export const tickerItems = [
  'Tham quan từ xa',
  'Robot tự hành',
  'Một livestream chung',
  'Hỏi AI riêng',
  'Bản đồ 2D · Digital Twin',
  'An toàn là trước hết',
]

export type ProcessStep = { id: string; step: string; actor: string; title: string; body: string; image?: string; alt: string }

/** A step without `image` renders the animated route illustration instead. */
export const processSteps: ProcessStep[] = [
  {
    id: 'dang-ky',
    step: '01',
    actor: 'Đại diện',
    title: 'Đăng ký đoàn',
    body: 'Admin tạo buổi tham quan. Đại diện lớp gửi đăng ký kèm file Excel danh sách học sinh.',
    image: '/images/booking-app.avif',
    alt: 'Người dùng thao tác đăng ký trên điện thoại',
  },
  {
    id: 'duyet',
    step: '02',
    actor: 'Admin',
    title: 'Duyệt và gửi mã đoàn',
    body: 'Admin duyệt đăng ký, gửi email link và mã đoàn, rồi Chốt buổi sang READY khi đủ nội dung và tuyến.',
    image: '/images/robot_mission_orchestration_hero.webp',
    alt: 'Màn hình điều phối robot và bản đồ tuyến',
  },
  {
    id: 'khoi-hanh',
    step: '03',
    actor: 'Staff · Robot',
    title: 'Robot khởi hành',
    body: 'Staff kiểm tra định vị, nguồn và camera rồi bấm Start. Robot tự hành qua từng POI, dừng, xoay góc và đi tiếp.',
    alt: 'Sơ đồ tuyến: Xuất phát, AI Lab, Thư viện, Không gian sáng tạo, Kết thúc',
  },
  {
    id: 'xem-live',
    step: '04',
    actor: 'Học sinh',
    title: 'Xem live và hỏi AI',
    body: 'Học sinh vào phòng chờ, xem livestream, theo dõi map 2D, nghe thuyết minh và hỏi trợ lý AI riêng.',
    image: '/images/ai-assistant.avif',
    alt: 'Loa trợ lý giọng nói với vòng sáng',
  },
]

export const robotSpecs = [
  { id: 'ros', title: 'Tự hành ROS 2', body: 'Nav2 tìm đường, tránh vật cản và dừng cục bộ. Backend không gửi từng xung motor.' },
  { id: 'camera', title: 'Nguồn hình trên giá xoay', body: 'Quest 3 chỉ là nguồn hình, dự phòng camera RGB/UVC. Không xoay camera phục vụ navigation.' },
  { id: 'bridge', title: 'fleet_bridge', body: 'Bridge Python trên robot chủ động kết nối backend qua SignalR, chuyển lệnh thành Nav2 action.' },
  { id: 'safety', title: 'An toàn trước hết', body: 'Lỗi robot hoặc mất trạng thái chuyển phiên sang NEEDS_ASSISTANCE. Dừng khẩn cấp theo cơ chế của robot.' },
]

/** Names only, set as text. No third-party logos on this page. */
export const techStack = [
  { name: 'ROS 2', note: 'Nav2' },
  { name: 'ASP.NET Core' },
  { name: 'SignalR' },
  { name: 'React', note: '+ Vite' },
  { name: 'Three.js' },
  { name: 'Gazebo' },
  { name: 'Meta Quest 3' },
  { name: 'Python', note: 'Bridge' },
]

export type Insight = {
  id: string
  category: string
  title: string
  summary: string
  /** A missing image renders the TourState diagram. */
  image?: string
  alt: string
  imagePosition?: string
  highlight?: boolean
}

export const insights: Insight[] = [
  {
    id: 'backend-ros',
    category: 'Kiến trúc',
    title: 'Backend giữ quy tắc tour, ROS giữ chuyển động: vì sao phải tách rõ',
    summary: 'ASP.NET quyết định đi điểm nào, khi nào giới thiệu, khi nào hết giờ. Nav2 lo tìm đường và dừng cục bộ. SignalR chỉ là cửa nhận và gửi.',
    image: '/images/robot_mission_orchestration_hero.webp',
    alt: 'Bảng điều phối robot với tuyến đường',
    highlight: true,
  },
  {
    id: 'quest',
    category: 'Phần cứng',
    title: 'Quest 3 chỉ là nguồn hình: bài thử 40 phút không người đeo',
    summary: 'Cổng kiểm chứng đầu tiên: lấy được hình khi đứng yên, xoay, di chuyển, đổi ánh sáng và kết nối lại. Không đạt thì chuyển sang camera UVC.',
    image: '/images/tro-chuyen.avif',
    alt: 'Phần cứng thử nghiệm với dây nối',
    imagePosition: 'center 30%',
    highlight: true,
  },
  {
    id: 'emulator',
    category: 'Mô phỏng',
    title: 'Gazebo và fleet emulator: thử tải trước khi có robot thật',
    summary: 'Emulator dùng cùng contract fleet, gắn dấu Synthetic để không lẫn với số đo thực địa.',
    image: '/images/digital-twin.jpg',
    alt: 'Bản đồ số của khuôn viên',
    imagePosition: 'center 35%',
  },
  {
    id: 'needs-assistance',
    category: 'Vận hành',
    title: 'NEEDS_ASSISTANCE: khi nào robot dừng và chờ Staff',
    summary: 'Mất riêng livestream không tự hủy chặng đang chạy. Lỗi robot hoặc mất trạng thái điều khiển áp dụng policy dừng riêng.',
    alt: 'Sơ đồ trạng thái Tour: SCHEDULED, READY, RUNNING, COMPLETED hoặc CANCELLED',
  },
  {
    id: 'roster',
    category: 'Nghiệp vụ',
    title: 'Mã đoàn và họ tên không dấu: vào phiên mà không cần tài khoản',
    summary: 'Đối chiếu roster đã duyệt để vào phòng chờ. Quyền luôn kiểm tra theo trạng thái server hiện hành.',
    image: '/images/booking-app.avif',
    alt: 'Người dùng thao tác trên điện thoại',
    imagePosition: 'center 40%',
  },
]

export const faqs = [
  {
    q: 'Học sinh có cần tạo tài khoản để tham gia không?',
    a: 'Không. Đại diện lớp gửi danh sách Excel, Admin duyệt và gửi email có đường link cùng mã đoàn. Học sinh nhập mã đoàn và họ tên, lớp để đối chiếu với danh sách rồi vào phòng chờ.',
  },
  {
    q: 'Học sinh có điều khiển được robot hay camera không?',
    a: 'Không. Mọi người cùng xem một góc nhìn chung. Robot tự hành theo tuyến đã cấu hình, đầu xoay theo góc đã thử trước, và chỉ Staff mới có thể Giữ, Đi tiếp hoặc Kết thúc sớm.',
  },
  {
    q: 'Trợ lý AI trả lời câu hỏi như thế nào?',
    a: 'Câu hỏi được gửi qua backend và câu trả lời chỉ trả về đúng trình duyệt đã hỏi, không phát cho cả đoàn. Bản đầu dùng văn bản, sau đó thêm đọc câu trả lời (TTS) và nhận giọng nói (STT), tất cả cùng một ngôn ngữ. AI không xem video và không điều khiển robot.',
  },
  {
    q: 'Điều gì xảy ra nếu mất livestream hoặc robot gặp sự cố?',
    a: 'Nếu chỉ mất livestream mà navigation vẫn bình thường, chặng đang chạy vẫn hoàn tất rồi giữ lại. Nếu robot lỗi hoặc mất trạng thái điều khiển, phiên chuyển sang NEEDS_ASSISTANCE và chờ Staff kiểm tra trước khi đi tiếp hoặc kết thúc.',
  },
  {
    q: 'Làm sao để đăng ký một buổi tham quan cho lớp?',
    a: 'Khi nhà trường mở buổi tham quan, đại diện lớp gửi đăng ký kèm file Excel danh sách học sinh. Sau khi Admin duyệt, đại diện nhận email thông tin tham gia để chia sẻ cho cả lớp.',
  },
]

/** Placeholder until the team publishes its own address. */
export const CONTACT_EMAIL = 'campustour@example.edu.vn'

// Mock data for user dashboard
export interface UserStats {
  upcomingTours: number;
  completedTours: number;
  favoritePlaces: number;
  notifications: number;
}

export interface Notification {
  id: string;
  type: 'booking' | 'reminder' | 'robot' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface FavoritePlace {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  category: string;
}

export interface RecommendedPlace {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  reason: string;
}

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  link: string;
  color: 'accent' | 'cyan' | 'emerald' | 'amber';
}

export const mockUserStats: UserStats = {
  upcomingTours: 2,
  completedTours: 8,
  favoritePlaces: 5,
  notifications: 3,
};

export const mockNotifications: Notification[] = [
  {
    id: 'n1',
    type: 'reminder',
    title: 'Tour sắp bắt đầu',
    message: 'Tour Khám Phá Toàn Diện sẽ bắt đầu sau 1 giờ. Robot đang sẵn sàng tại cổng chính.',
    timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
    read: false,
  },
  {
    id: 'n2',
    type: 'robot',
    title: 'Robot đang đến điểm đón',
    message: 'AMR-01 sẽ đến điểm đón trong 5 phút. Vui lòng chuẩn bị.',
    timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
    read: false,
  },
  {
    id: 'n3',
    type: 'booking',
    title: 'Đặt tour thành công',
    message: 'Tour Công Nghệ & Innovation vào 22/12/2026 đã được xác nhận.',
    timestamp: new Date(Date.now() - 24 * 3600000).toISOString(),
    read: true,
  },
];

export const mockFavoritePlaces: FavoritePlace[] = [
  {
    id: 'f1',
    name: 'Thư viện Trung tâm',
    description: 'Không gian học tập hiện đại với hơn 50,000 đầu sách',
    imageUrl: '/images/hero-campus.jpg',
    category: 'Học tập',
  },
  {
    id: 'f2',
    name: 'Innovation Hub',
    description: 'Trung tâm khởi nghiệp và đổi mới sáng tạo',
    imageUrl: '/images/digital-twin.jpg',
    category: 'Nghiên cứu',
  },
  {
    id: 'f3',
    name: 'AI Lab',
    description: 'Phòng thí nghiệm trí tuệ nhân tạo',
    imageUrl: '/images/ai-assistant.jpg',
    category: 'Công nghệ',
  },
  {
    id: 'f4',
    name: 'Hội trường A',
    description: 'Sân khấu lớn tổ chức sự kiện và hội thảo',
    imageUrl: '/images/booking-app.jpg',
    category: 'Sự kiện',
  },
  {
    id: 'f5',
    name: 'Khu kỹ thuật',
    description: 'Phòng lab robot và điện tử',
    imageUrl: '/images/hero-campus.jpg',
    category: 'Kỹ thuật',
  },
];

export const mockRecommendedPlaces: RecommendedPlace[] = [
  {
    id: 'r1',
    name: 'Trung tâm Thể thao',
    description: 'Phòng gym, sân bóng, bể bơi Olympic',
    imageUrl: '/images/hero-campus.jpg',
    reason: 'Dựa trên sở thích của bạn',
  },
  {
    id: 'r2',
    name: 'Căn tin Trung tâm',
    description: 'Đa dạng món ăn Á - Âu',
    imageUrl: '/images/booking-app.jpg',
    reason: 'Địa điểm phổ biến',
  },
  {
    id: 'r3',
    name: 'Khu vườn Xanh',
    description: 'Không gian thư giãn ngoài trời',
    imageUrl: '/images/digital-twin.jpg',
    reason: 'Gần điểm yêu thích của bạn',
  },
];

export const mockQuickActions: QuickAction[] = [
  {
    id: 'qa1',
    title: 'Đặt Tour',
    description: 'Khám phá khuôn viên',
    icon: 'calendar',
    link: '/tours',
    color: 'accent',
  },
  {
    id: 'qa2',
    title: 'Tour Của Tôi',
    description: 'Xem lịch đã đặt',
    icon: 'ticket',
    link: '/my-bookings',
    color: 'cyan',
  },
  {
    id: 'qa3',
    title: 'Check-in',
    description: 'Quét QR để bắt đầu',
    icon: 'qrcode',
    link: '/my-bookings',
    color: 'emerald',
  },
  {
    id: 'qa4',
    title: 'Bản đồ',
    description: 'Khám phá địa điểm',
    icon: 'map',
    link: '/map',
    color: 'cyan',
  },
  {
    id: 'qa5',
    title: 'Yêu thích',
    description: 'Địa điểm đã lưu',
    icon: 'heart',
    link: '/favorites',
    color: 'accent',
  },
  {
    id: 'qa6',
    title: 'Trợ lý AI',
    description: 'Hỏi & tư vấn',
    icon: 'sparkles',
    link: '/ai-guide',
    color: 'emerald',
  },
];

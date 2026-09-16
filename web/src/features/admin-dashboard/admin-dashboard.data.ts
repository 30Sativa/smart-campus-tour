export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface OperationalSummaryItem {
  label: string;
  value: string;
  detail: string;
  tone: StatusTone;
}

export interface AlertRecord {
  id: string;
  severity: 'Cao' | 'Trung bình' | 'Thông tin';
  title: string;
  source: string;
  target: string;
  occurredAt: string;
  status: string;
  description: string;
  recovery: string;
}

export interface TourScheduleRecord {
  id: string;
  time: string;
  visitorSummary: string;
  route: string;
  session: string;
  amr: string;
  status: 'Đang hoạt động' | 'Sắp bắt đầu' | 'Đã hoàn tất';
}

export interface AdminActionRecord {
  id: string;
  title: string;
  context: string;
  due: string;
  actionLabel: string;
  version?: string;
}

export const operationalSummary: OperationalSummaryItem[] = [
  {
    label: 'Trạng thái AMR',
    value: 'Sẵn sàng',
    detail: '1 AMR vật lý',
    tone: 'success',
  },
  {
    label: 'Telemetry',
    value: 'Live',
    detail: 'Cập nhật 8 giây trước',
    tone: 'success',
  },
  {
    label: 'Tour đang chạy',
    value: '1',
    detail: 'Session TS-0915-01',
    tone: 'info',
  },
  {
    label: 'Cảnh báo mở',
    value: '2',
    detail: '1 mức cao',
    tone: 'danger',
  },
  {
    label: 'Chờ Admin',
    value: '3',
    detail: 'Cần xem xét',
    tone: 'warning',
  },
];

export const alerts: AlertRecord[] = [
  {
    id: 'ALT-0915-014',
    severity: 'Cao',
    title: 'Điều hướng bị gián đoạn tại POI-02',
    source: 'Navigation',
    target: 'AMR-01',
    occurredAt: '10:14',
    status: 'Đang theo dõi',
    description: 'AMR đã dừng an toàn và gửi navigation fault kèm Mission ID.',
    recovery: 'Tour Operator kiểm tra lối đi và chọn hành động phù hợp với trạng thái mission.',
  },
  {
    id: 'ALT-0915-011',
    severity: 'Trung bình',
    title: 'Cloud Storage đang ở trạng thái suy giảm',
    source: 'Media Storage',
    target: 'Knowledge Media',
    occurredAt: '09:42',
    status: 'Đang mở',
    description: 'Tác vụ media mới có thể bị trì hoãn. Dữ liệu vận hành AMR không bị ảnh hưởng.',
    recovery: 'Giữ media ở trạng thái chưa sẵn sàng và thử lại sau khi dependency phục hồi.',
  },
];

export const todaySchedule: TourScheduleRecord[] = [
  {
    id: 'BK-0915-021',
    time: '09:00',
    visitorSummary: 'Nhóm khách 04',
    route: 'Tuyến tham quan chính',
    session: 'TS-0915-01',
    amr: 'AMR-01',
    status: 'Đang hoạt động',
  },
  {
    id: 'BK-0915-024',
    time: '13:30',
    visitorSummary: 'Nhóm khách 02',
    route: 'Tuyến tham quan chính',
    session: 'TS-0915-02',
    amr: 'Chờ kiểm tra',
    status: 'Sắp bắt đầu',
  },
  {
    id: 'BK-0915-018',
    time: '08:00',
    visitorSummary: 'Nhóm khách 03',
    route: 'Tuyến tham quan chính',
    session: 'TS-0915-00',
    amr: 'AMR-01',
    status: 'Đã hoàn tất',
  },
];

export const pendingActions: AdminActionRecord[] = [
  {
    id: 'DTR-0915-03',
    title: 'Xem xét kết quả Digital Twin',
    context: 'Scenario kiểm chứng tuyến tham quan chính đã hoàn tất.',
    due: 'Cập nhật 18 phút trước',
    actionLabel: 'Xem kết quả',
    version: 'Scenario v0.4',
  },
  {
    id: 'KB-POI-02-V5',
    title: 'Duyệt phiên bản tri thức POI-02',
    context: 'Nội dung tiếng Việt đang ở trạng thái Draft.',
    due: 'Cập nhật 1 giờ trước',
    actionLabel: 'Xem nội dung',
    version: 'Knowledge v5',
  },
  {
    id: 'AIR-0915-07',
    title: 'Xem báo cáo câu trả lời AI',
    context: 'Báo cáo có Interaction ID và Tour Session context.',
    due: 'Cập nhật 2 giờ trước',
    actionLabel: 'Xem báo cáo',
  },
];

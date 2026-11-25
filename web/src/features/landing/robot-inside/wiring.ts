/**
 * What runs through the CampusTour robot, cable by cable, for the "Bên trong
 * robot" page (`/ben-trong-robot`).
 *
 * Sources: the STM32 pin map and wiring notes
 * (`robot/firmware/stm32/motor_controller/docs/PIN_MAP.md`,
 * `WIRING_MOTOR_245.md`, `ENCODER_HBS57H.md`, `ALM_HBS57H.md`,
 * `HEAD_PAN_TILT.md`), the drivetrain constants in `Core/Inc/motor/motor.h`,
 * the USB protocol (`robot/docs/PROTOCOL_FB.md`), the video path
 * (`robot/quest-stream/README.md`) and the E-stop notes
 * (`robot/docs/test-readiness-2026-11-10.md`). The 48 V LiFePO4 pack is the
 * owner's hardware block drawing HW-01.
 *
 * Where each part sits comes from the SolidWorks model
 * (`public/models/robot/campus-amr-explode.glb`, the bounds of each part
 * group). Three parts are not in that model and are placed by hand:
 * the DC-DC converter, the contactor and the E-stop (`virtual`). The
 * cable routes are drawn, not measured: they show which part feeds which,
 * not the exact path of each wire in the robot.
 */
import type { PartGroupId } from '../robot-explode/parts'
import type { Box3, Point3 } from './iso'

/* ---------- What a wire carries ---------- */

/** amber: 48 V to the wheels; teal: the lower voltages; red: commands; blue: readings; violet: video. */
export type WireKind = 'power' | 'low' | 'command' | 'feedback' | 'video'

export const WIRE_KINDS: readonly { kind: WireKind; label: string; color: string }[] = [
  { kind: 'power', label: 'Điện động lực 48 V', color: '#f2b33d' },
  { kind: 'low', label: 'Điện hạ áp', color: '#36d1b4' },
  { kind: 'command', label: 'Lệnh và xung điều khiển', color: '#ff6a5c' },
  { kind: 'feedback', label: 'Cảm biến và tín hiệu báo về', color: '#5aa9f2' },
  { kind: 'video', label: 'Hình ảnh', color: '#a98af0' },
]

export function wireColor(kind: WireKind): string {
  return WIRE_KINDS.find(item => item.kind === kind)!.color
}

/* ---------- The parts ---------- */

export type InsideId =
  | 'battery' | 'dcdc' | 'contactor' | 'estop'
  | 'pc' | 'pcb'
  | 'driver' | 'motor' | 'drv' | 'pantilt'
  | 'quest' | 'lidar' | 'camera' | 'sonar'
  | 'tour'

export type Cluster = 'power' | 'brain' | 'motion' | 'sense' | 'video'

export const CLUSTERS: readonly { id: Cluster; label: string }[] = [
  { id: 'power', label: 'Nguồn điện' },
  { id: 'brain', label: 'Hai bộ não' },
  { id: 'motion', label: 'Chuyển động' },
  { id: 'sense', label: 'Cảm biến' },
  { id: 'video', label: 'Hình ảnh' },
]

/** An upright cylinder: its centre on the floor plan, its radius and its heights. */
export type Cylinder = { centre: readonly [number, number]; radius: number; from: number; to: number }

export type InsideComponent = {
  id: InsideId
  /** Its number on the drawing. */
  number: number
  label: string
  /** Part number or the short technical line under the name. */
  model: string
  cluster: Cluster
  /** Where it sits in the model: boxes, or an upright cylinder. Empty for a node off the robot. */
  boxes: readonly Box3[]
  cylinder?: Cylinder
  /** Not in the CAD model: placed by hand, drawn dashed. */
  virtual?: boolean
  /** Off the robot: drawn as a card at this point of the air beside it. */
  offRobot?: Point3
  /** What it does, one sentence. */
  role: string
  /** How it works, a few short paragraphs. */
  how: readonly string[]
  specs: readonly (readonly [string, string])[]
}

export const COMPONENTS: readonly InsideComponent[] = [
  {
    id: 'battery', number: 1, label: 'Pin LiFePO4', model: '48 V · 20 Ah', cluster: 'power',
    boxes: [{ min: [-0.245, 0.206, -0.174], max: [-0.078, 0.437, 0.175] }],
    role: 'Nguồn năng lượng duy nhất của robot: mọi đường điện trên xe đều bắt đầu từ khối pin này.',
    how: [
      'Pin lithium sắt phốt phát giữ điện áp khá phẳng khi xả, nên bánh xe có lực đều từ đầu tới cuối buổi tham quan.',
      'Từ cực pin, điện chia hai nhánh. Nhánh 48 V đi qua contactor tới hai driver bánh xe. Nhánh còn lại vào bộ hạ áp để nuôi máy tính và các mạch nhỏ.',
    ],
    specs: [['Điện áp', '48 V danh định'], ['Dung lượng', '20 Ah'], ['Loại', 'LiFePO4'], ['Nhánh ra', 'Động lực 48 V · hạ áp']],
  },
  {
    id: 'dcdc', number: 2, label: 'Bộ hạ áp DC-DC', model: 'Từ 48 V xuống mức của máy tính và mạch', cluster: 'power', virtual: true,
    boxes: [{ min: [0.09, 0.215, -0.02], max: [0.19, 0.265, 0.1] }],
    role: 'Đổi 48 V của pin thành các mức điện thấp mà máy tính, mạch điều khiển và driver đầu quay cần.',
    how: [
      'Bộ DC-DC đóng ngắt rất nhanh rồi lọc lại, nên hạ được điện áp mà ít tỏa nhiệt hơn nhiều so với hạ áp bằng điện trở.',
      'Ngõ ra nuôi Mini PC, đường 5 V của mạch điều khiển (trên mạch hạ tiếp xuống 3,3 V cho STM32) và nguồn VMOT 12 đến 24 V cho hai driver đầu quay.',
    ],
    specs: [['Vào', '48 V từ pin'], ['Ra', 'Mini PC · 5 V · VMOT 12 đến 24 V'], ['Trên hình', 'Vị trí minh họa, không có trong mô hình CAD']],
  },
  {
    id: 'contactor', number: 3, label: 'Contactor nguồn động cơ', model: 'Đóng cắt bằng MOSFET · chân PA10', cluster: 'power', virtual: true,
    boxes: [{ min: [0.09, 0.215, -0.17], max: [0.17, 0.27, -0.1] }],
    role: 'Công tắc điện tử cho phép hoặc cắt hẳn điện 48 V tới hai driver bánh xe.',
    how: [
      'STM32 kéo chân PA10 lên mức cao để mở MOSFET, contactor đóng và 48 V đi tiếp tới hai driver. Contactor đóng ngay khi STM32 khởi động.',
      'Máy tính cắt hẳn điện động cơ bằng lệnh CONTACTOR,OFF. Lệnh dừng hay watchdog chỉ ngừng phát xung, không tự ngắt contactor.',
    ],
    specs: [['Điều khiển', 'PA10, mức cao là đóng'], ['Lệnh', 'CONTACTOR,<seq>,ON / OFF'], ['Khi khởi động', 'Đóng'], ['Trên hình', 'Vị trí minh họa']],
  },
  {
    id: 'estop', number: 4, label: 'Nút dừng khẩn', model: 'E-stop phần cứng', cluster: 'power', virtual: true,
    boxes: [],
    cylinder: { centre: [0.2, -0.33], radius: 0.024, from: 0.473, to: 0.512 },
    role: 'Người đi kèm robot bấm nút này để cắt điện động cơ ngay, không phải chờ phần mềm.',
    how: [
      'Nút nằm trên đường điều khiển contactor (PA10 / J_3V3_AUX). Bấm xuống là contactor nhả và hai driver mất nguồn 48 V; Mini PC và mạch điều khiển vẫn có điện để ghi log.',
      'Nhả nút là điện có lại ngay, vì vậy quy trình vận hành yêu cầu dừng lệnh và hủy mọi đích đến trước khi nhả.',
    ],
    specs: [['Cắt', 'Nguồn 48 V của hai driver'], ['Giữ điện', 'Mini PC, STM32'], ['Trên hình', 'Vị trí minh họa']],
  },
  {
    id: 'pc', number: 5, label: 'Mini PC', model: 'Ubuntu 22.04 · ROS 2 Humble · Nav2', cluster: 'brain',
    boxes: [{ min: [-0.058, 0.355, -0.052], max: [0.058, 0.396, 0.051] }],
    role: 'Bộ não chính: biết robot đang ở đâu, tính đường đi và gửi hình ảnh tới học sinh.',
    how: [
      'Mini PC nhận vòng quét LiDAR, ảnh camera và khung báo về của STM32, ghép lại để định vị trên bản đồ và lập đường đi bằng Nav2.',
      'Liên tục, nó gửi xuống STM32 tốc độ của hai bánh qua một cáp USB. Cùng lúc, nó đọc luồng hình từ kính Quest 3 và phát qua Wi-Fi tới trang tour.',
    ],
    specs: [['Hệ điều hành', 'Ubuntu 22.04'], ['Phần mềm', 'ROS 2 Humble · Nav2'], ['Cổng USB', 'STM32 · LiDAR · camera · Quest 3'], ['Mạng', 'Wi-Fi']],
  },
  {
    id: 'pcb', number: 6, label: 'Mạch điều khiển STM32', model: 'STM32G431 · 74HCT245 · AM26LV32E · IMU BNO085', cluster: 'brain',
    boxes: [{ min: [-0.048, 0.362, -0.172], max: [0.047, 0.381, -0.086] }],
    role: 'Bộ não thời gian thực: biến lệnh của máy tính thành từng xung cho động cơ và đọc mọi cảm biến ở gần.',
    how: [
      'STM32 phát xung STEP cho bánh xe trong ngắt TIM2 50 kHz và cho đầu quay trong ngắt TIM6 10 kHz. Năm mươi lần mỗi giây nó gửi lên máy tính một khung FB: số xung, encoder, siêu âm, góc IMU và trạng thái đầu quay.',
      'Chip 74HCT245 nâng xung 3,3 V của STM32 lên 5 V cho driver bánh xe; chip AM26LV32E nhận tín hiệu encoder vi sai của hai động cơ. IMU BNO085 nằm ngay trên mạch, nối qua I²C trên PB6/PB7.',
      'Nếu lệnh tốc độ không tới trong 300 ms, watchdog trên STM32 tự dừng hai bánh.',
    ],
    specs: [['Vi điều khiển', 'STM32G431 · Cortex-M4'], ['Nối máy tính', 'USB CDC · PA11/PA12'], ['Báo về', 'Khung FB · 50 Hz'], ['IMU', 'BNO085 · I²C 0x4A'], ['Chân đang dùng', '32 / 42']],
  },
  {
    id: 'driver', number: 7, label: 'Driver HBS57H ×2', model: 'Servo lai vòng kín · 1600 xung mỗi vòng', cluster: 'motion',
    boxes: [
      { min: [0.066, 0.234, -0.332], max: [0.216, 0.289, -0.222] },
      { min: [-0.215, 0.234, -0.332], max: [-0.065, 0.289, -0.222] },
    ],
    role: 'Biến xung STEP/DIR thành dòng điện lớn cho cuộn dây động cơ, mỗi bánh một bộ.',
    how: [
      'Mỗi xung STEP tới, driver đẩy dòng qua hai cuộn pha A và B để trục quay thêm một vi bước; mức DIR chọn chiều quay. Xung càng dày, bánh quay càng nhanh.',
      'HBS57H đọc encoder của chính động cơ để tự bù khi trục bị trễ bước (vòng kín). Khi có lỗi, ngõ ALM báo về STM32.',
    ],
    specs: [['Vào', 'PUL/DIR 5 V qua 74HCT245'], ['Độ phân giải', '1600 xung mỗi vòng động cơ'], ['Nguồn', '48 V qua contactor'], ['Báo lỗi', 'ALM → PC10 / PC11']],
  },
  {
    id: 'motor', number: 8, label: 'Động cơ bánh xe ×2', model: '57EBP98ALC · hộp số 10:1 · bánh 194,5 mm', cluster: 'motion',
    boxes: [
      { min: [0.022, 0.069, -0.029], max: [0.148, 0.126, 0.029] },
      { min: [-0.152, 0.069, -0.029], max: [-0.026, 0.126, 0.029] },
    ],
    role: 'Quay hai bánh chủ động ở giữa thân xe; robot rẽ khi hai bánh quay khác tốc độ.',
    how: [
      'Dòng điện đổi chiều lần lượt trong hai cuộn dây kéo trục quay từng bước 1,8°. Hộp số hành tinh 10:1 giảm tốc và tăng lực trước khi tới bánh.',
      'Một vòng bánh ứng với 1600 × 10 = 16 000 xung STEP, khoảng 26 xung cho mỗi milimét đường đi. Máy tính đếm chính các xung này để biết robot đã đi bao xa.',
    ],
    specs: [['Bước', '1,8° · 200 bước mỗi vòng'], ['Hộp số', 'F57-L1-10-P2 · 10:1'], ['Bánh', 'Ø 194,5 mm'], ['Encoder', 'EA / EB vi sai']],
  },
  {
    id: 'drv', number: 9, label: 'Driver DRV8825 ×2', model: 'Driver bước cho pan và tilt · vi bước 1/4', cluster: 'motion',
    boxes: [
      { min: [0.025, 0.363, 0.11], max: [0.067, 0.386, 0.139] },
      { min: [-0.068, 0.363, 0.11], max: [-0.025, 0.386, 0.139] },
    ],
    role: 'Cấp dòng cho hai động cơ nhỏ quay ngang (pan) và gật (tilt) đầu camera.',
    how: [
      'STM32 gửi STEP, DIR và nEN riêng cho từng trục. nEN ở mức thấp mới bật driver; lúc khởi động firmware giữ nó ở mức cao để đầu không giật.',
      'Hai driver chạy vi bước 1/4 cho êm và lấy nguồn VMOT 12 đến 24 V từ bộ hạ áp.',
    ],
    specs: [['Pan', 'PA8 STEP · PA15 DIR · PB2 nEN'], ['Tilt', 'PA9 STEP · PA7 DIR · PB10 nEN'], ['Vi bước', '1/4'], ['Nguồn', 'VMOT 12 đến 24 V']],
  },
  {
    id: 'pantilt', number: 10, label: 'Đầu pan-tilt', model: '2 động cơ NEMA17 · hộp số 4:1 và 16:1', cluster: 'motion',
    boxes: [{ min: [-0.076, 0.803, -0.078], max: [0.075, 1.035, 0.078] }],
    role: 'Xoay và gật mô hình đầu đeo kính Quest 3, để học sinh nhìn đúng vào điểm dừng.',
    how: [
      'Trục pan qua hộp số 4:1, mỗi bước 0,45°, quay được ±170°. Trục tilt qua hộp số 16:1, mỗi bước 0,1125°, gật trong ±18° và đủ lực giữ đầu cùng kính khoảng 2 kg.',
      'Góc được tính từ số xung đã phát rồi báo về trong khung FB. Lệnh HOME cho đầu tìm vật chặn để lấy lại mốc 0°.',
    ],
    specs: [['Pan', '±170° · 0,45° mỗi bước'], ['Tilt', '±18° · 0,1125° mỗi bước'], ['Động cơ', '17HD4401S · NEMA17'], ['Lệnh', 'HEAD,<seq>,<pan>,<tilt>']],
  },
  {
    id: 'quest', number: 11, label: 'Kính Meta Quest 3', model: 'Góc nhìn của chuyến đi · USB-C', cluster: 'video',
    boxes: [{ min: [-0.097, 1.113, -0.111], max: [0.103, 1.276, 0.152] }],
    role: 'Ghi lại đúng góc nhìn mà học sinh thấy trên trang tour.',
    how: [
      'Kính cắm USB-C vào Mini PC. Máy đọc thẳng luồng H.264 của kính qua ADB, không ghi ra file, rồi FFmpeg lấy hình mắt trái, cắt khung 1280×720, 30 khung mỗi giây.',
      'Cùng sợi cáp đó sạc pin cho kính trong suốt chuyến đi.',
    ],
    specs: [['Hình', '1280×720 · 30 khung mỗi giây'], ['Mã hóa', 'H.264'], ['Nối', 'USB-C · ADB'], ['Tới học sinh', 'Trễ dưới 1 giây']],
  },
  {
    id: 'lidar', number: 12, label: 'LiDAR RPLiDAR A3M1', model: 'Quét laser 360° · USB', cluster: 'sense',
    boxes: [],
    cylinder: { centre: [0, 0], radius: 0.037, from: 0.453, to: 0.494 },
    role: 'Đo khoảng cách tới tường và vật cản quanh robot, là con mắt chính để định vị.',
    how: [
      'Đầu đo quay tròn và đo khoảng cách theo từng góc, mỗi vòng quét thành một tia sáng quanh robot.',
      'Mini PC nhận từng vòng quét qua USB (topic /scan), dùng để lập bản đồ, định vị robot trên bản đồ đó và đánh dấu vật cản cho Nav2.',
    ],
    specs: [['Loại', 'RPLiDAR A3M1'], ['Dữ liệu', '/scan · ROS 2'], ['Nối', 'USB'], ['Dùng cho', 'Lập bản đồ · định vị · tránh vật cản']],
  },
  {
    id: 'camera', number: 13, label: 'Camera Orbbec Astra Pro', model: 'Ảnh màu và ảnh độ sâu · USB', cluster: 'sense',
    boxes: [{ min: [-0.1, 0.235, 0.335], max: [0.1, 0.288, 0.395] }],
    role: 'Nhìn phía trước robot bằng ảnh màu và ảnh độ sâu.',
    how: [
      'Astra Pro là hai thiết bị USB trong một vỏ: camera màu và cảm biến độ sâu. Ảnh độ sâu cho biết mỗi điểm ảnh cách robot bao xa.',
      'Dữ liệu này dùng cho nhận diện người phía trước và có thể đưa vào bản đồ vật cản của Nav2; cả hai đang tắt theo mặc định.',
    ],
    specs: [['Loại', 'Orbbec Astra Pro'], ['Ảnh độ sâu', 'Khoảng 30 Hz'], ['Nối', 'USB · 2 thiết bị'], ['Trạng thái', 'Tùy chọn, mặc định tắt']],
  },
  {
    id: 'sonar', number: 14, label: 'Siêu âm JSN-SR04T ×4', model: 'Đầu dò chống nước và mạch đo · bốn góc', cluster: 'sense',
    boxes: [
      { min: [-0.24, 0.327, 0.209], max: [-0.212, 0.348, 0.251] },
      { min: [0.212, 0.327, 0.209], max: [0.241, 0.348, 0.251] },
      { min: [0.212, 0.327, -0.251], max: [0.238, 0.348, -0.209] },
      { min: [-0.24, 0.327, -0.251], max: [-0.212, 0.348, -0.21] },
      { min: [0.248, 0.204, 0.368], max: [0.278, 0.23, 0.398] },
      { min: [-0.278, 0.204, 0.368], max: [-0.247, 0.231, 0.398] },
      { min: [0.248, 0.204, -0.398], max: [0.278, 0.231, -0.368] },
      { min: [-0.278, 0.204, -0.398], max: [-0.247, 0.23, -0.368] },
    ],
    role: 'Phát hiện vật cản sát thân xe ở bốn góc, nơi LiDAR dễ bỏ sót.',
    how: [
      'STM32 phát xung TRIG; mạch SR04T phát chùm sóng 40 kHz qua đầu dò rồi nghe tiếng dội. Chân ECHO giữ mức cao đúng bằng thời gian sóng đi và về.',
      'STM32 đo độ dài xung ECHO bằng ngắt: khoảng cách (mm) ≈ thời gian (µs) × 0,343 ÷ 2. Bốn khoảng cách đi lên máy tính trong khung FB.',
    ],
    specs: [['TRIG', 'PB0 · PB11 · PB13 · PB15'], ['ECHO', 'PB1 · PB12 · PB14 · PA6'], ['Sóng', '40 kHz'], ['Tầm đo', 'Khoảng 0,25 đến 4,5 m']],
  },
  {
    id: 'tour', number: 15, label: 'Trang tour của học sinh', model: 'Ngoài robot · trình duyệt', cluster: 'video',
    boxes: [], offRobot: [0.36, 1.16, -0.34],
    role: 'Nơi hình ảnh của chuyến đi tới tay học sinh.',
    how: [
      'Mini PC đẩy luồng hình vào MediaMTX, rồi phát qua WebRTC tới trình duyệt của từng học sinh với độ trễ dưới một giây; HLS là đường dự phòng.',
    ],
    specs: [['Giao thức', 'WebRTC · WHEP'], ['Dự phòng', 'HLS'], ['Kết nối', 'Wi-Fi → Internet']],
  },
]

const BY_ID = new Map(COMPONENTS.map(item => [item.id, item]))

export function component(id: InsideId): InsideComponent {
  const item = BY_ID.get(id)
  if (!item) throw new Error(`Unknown component: ${id}`)
  return item
}

export function isInsideId(value: string | null | undefined): value is InsideId {
  return value != null && BY_ID.has(value as InsideId)
}

/**
 * The page's part for a part group picked in the 3D model of section 04, so
 * its link can open the drawing on that part. Casing, frame and screws have
 * no wiring: they open the drawing as a whole.
 */
export const PART_TO_INSIDE: Partial<Record<PartGroupId, InsideId>> = {
  battery: 'battery', pc: 'pc', pcb: 'pcb', driver: 'driver', motor: 'motor', wheel: 'motor',
  drv: 'drv', pantilt: 'pantilt', column: 'pantilt', head: 'quest', quest: 'quest',
  lidar: 'lidar', camera: 'camera', sonar: 'sonar',
}

/* ---------- The wires ---------- */

export type InsideWire = {
  id: string
  kind: WireKind
  /** A second current running the other way on the same cable (a reply, or charging). */
  back?: WireKind
  from: InsideId
  to: InsideId
  /** The cable's name on the drawing and in the table. */
  label: string
  /** What runs through it. */
  carries: string
  /** Voltage or signal level. */
  level: string
  /** STM32 pins or connector, when known. */
  pins?: string
  /** No copper: a radio link, or a safety loop drawn as a dashed line. */
  dashed?: boolean
  /** One route per cable when the same connection is made more than once (two drivers, four sonars). */
  routes: readonly (readonly Point3[])[]
}

export const WIRES: readonly InsideWire[] = [
  // Power, 48 V.
  {
    id: 'bat-contactor', kind: 'power', from: 'battery', to: 'contactor', label: 'Nguồn động lực',
    carries: 'Điện 48 V từ pin tới contactor, trước khi vào hai driver bánh xe.', level: '48 V DC',
    routes: [[[-0.078, 0.245, -0.125], [0.0, 0.245, -0.125], [0.0, 0.245, -0.15], [0.09, 0.245, -0.15]]],
  },
  {
    id: 'contactor-driver', kind: 'power', from: 'contactor', to: 'driver', label: 'Nguồn driver',
    carries: 'Điện 48 V sau contactor, một cặp dây cho mỗi driver.', level: '48 V DC',
    routes: [
      [[0.13, 0.24, -0.17], [0.13, 0.24, -0.222]],
      [[0.09, 0.228, -0.162], [-0.03, 0.228, -0.162], [-0.03, 0.228, -0.2], [-0.12, 0.228, -0.2], [-0.12, 0.24, -0.222]],
    ],
  },
  {
    id: 'driver-motor', kind: 'power', from: 'driver', to: 'motor', label: 'Dòng pha A± / B±',
    carries: 'Dòng điện driver đẩy vào hai cuộn dây của động cơ, 4 dây cho mỗi động cơ.', level: 'Lấy từ 48 V, đổi chiều liên tục',
    routes: [
      [[0.11, 0.234, -0.27], [0.11, 0.1, -0.27], [0.11, 0.1, -0.029]],
      [[-0.11, 0.234, -0.27], [-0.11, 0.1, -0.27], [-0.11, 0.1, -0.029]],
    ],
  },
  {
    id: 'bat-dcdc', kind: 'power', from: 'battery', to: 'dcdc', label: 'Nguồn vào bộ hạ áp',
    carries: 'Điện 48 V vào bộ DC-DC.', level: '48 V DC',
    routes: [[[-0.078, 0.24, 0.05], [0.09, 0.24, 0.05]]],
  },

  // Lower voltages.
  {
    id: 'dcdc-pc', kind: 'low', from: 'dcdc', to: 'pc', label: 'Nguồn Mini PC',
    carries: 'Điện một chiều đã hạ áp cho máy tính.', level: 'DC hạ áp',
    routes: [[[0.15, 0.265, 0.03], [0.15, 0.335, 0.03], [0.058, 0.335, 0.03], [0.058, 0.37, 0.03]]],
  },
  {
    id: 'dcdc-pcb', kind: 'low', from: 'dcdc', to: 'pcb', label: 'Nguồn 5 V',
    carries: '5 V cho 74HCT245 và bốn cảm biến siêu âm; trên mạch hạ tiếp xuống 3,3 V cho STM32, IMU và AM26LV32E.', level: '5 V → 3,3 V',
    routes: [[[0.175, 0.265, -0.005], [0.175, 0.345, -0.005], [0.175, 0.345, -0.095], [0.047, 0.345, -0.095], [0.047, 0.368, -0.095]]],
  },
  {
    id: 'dcdc-drv', kind: 'low', from: 'dcdc', to: 'drv', label: 'Nguồn VMOT',
    carries: 'Nguồn động cơ cho hai driver DRV8825 của đầu quay.', level: '12 đến 24 V',
    routes: [[[0.125, 0.265, 0.1], [0.125, 0.35, 0.1], [0.125, 0.35, 0.125], [0.067, 0.35, 0.125], [0.067, 0.372, 0.125]]],
  },
  {
    id: 'drv-pantilt', kind: 'low', from: 'drv', to: 'pantilt', label: 'Dòng pha pan / tilt',
    carries: 'Dòng cho hai động cơ NEMA17 trong đầu quay, đi dọc thân trụ.', level: 'Lấy từ VMOT',
    routes: [[[0.046, 0.386, 0.125], [0.046, 0.52, 0.125], [0.046, 0.52, 0.096], [0.046, 0.88, 0.096], [0.046, 0.88, 0.078]]],
  },

  // Commands.
  {
    id: 'pc-pcb', kind: 'command', back: 'feedback', from: 'pc', to: 'pcb', label: 'USB CDC',
    carries: 'Xuống mạch: lệnh tốc độ hai bánh (CMD), góc đầu quay (HEAD), bật tắt contactor. Lên máy tính: khung FB 50 lần mỗi giây.',
    level: 'USB Full Speed', pins: 'PA11 USB_DM · PA12 USB_DP',
    routes: [[[0.03, 0.396, -0.03], [0.03, 0.425, -0.03], [0.03, 0.425, -0.13], [0.03, 0.381, -0.13]]],
  },
  {
    id: 'pcb-driver', kind: 'command', from: 'pcb', to: 'driver', label: 'Xung PUL / DIR',
    carries: 'Mỗi xung là một vi bước của động cơ; DIR chọn chiều quay. 74HCT245 nâng mức từ 3,3 V lên 5 V.',
    level: '3,3 V → 5 V', pins: 'Bánh 1: PA0 STEP · PA1 DIR · Bánh 2: PA2 STEP · PA3 DIR',
    routes: [
      [[0.047, 0.374, -0.16], [0.1, 0.374, -0.16], [0.1, 0.374, -0.275], [0.1, 0.289, -0.275]],
      [[-0.03, 0.374, -0.172], [-0.03, 0.374, -0.205], [-0.1, 0.374, -0.205], [-0.1, 0.374, -0.275], [-0.1, 0.289, -0.275]],
    ],
  },
  {
    id: 'pcb-drv', kind: 'command', from: 'pcb', to: 'drv', label: 'STEP · DIR · nEN',
    carries: 'Ba tín hiệu cho mỗi trục của đầu quay; nEN mức thấp mới bật driver.',
    level: '3,3 V', pins: 'Pan: PA8 · PA15 · PB2 · Tilt: PA9 · PA7 · PB10',
    routes: [[[-0.03, 0.381, -0.09], [-0.03, 0.41, -0.09], [-0.03, 0.41, 0.124], [-0.03, 0.386, 0.124]]],
  },
  {
    id: 'pcb-contactor', kind: 'command', from: 'pcb', to: 'contactor', label: 'Cổng MOSFET',
    carries: 'Mức cao ở PA10 đóng contactor, mức thấp nhả ra.', level: '3,3 V', pins: 'PA10 CONTACTOR_EN',
    routes: [[[0.047, 0.372, -0.12], [0.135, 0.372, -0.12], [0.135, 0.27, -0.12]]],
  },
  {
    id: 'estop-contactor', kind: 'command', from: 'estop', to: 'contactor', label: 'Mạch dừng khẩn', dashed: true,
    carries: 'Nút nằm nối tiếp trên đường điều khiển contactor: bấm xuống là ngắt, không qua phần mềm.',
    level: 'Phần cứng', pins: 'PA10 / J_3V3_AUX',
    routes: [[[0.2, 0.473, -0.33], [0.2, 0.3, -0.33], [0.2, 0.3, -0.135], [0.17, 0.3, -0.135], [0.155, 0.27, -0.135]]],
  },

  // Readings coming back.
  {
    id: 'driver-pcb', kind: 'feedback', from: 'driver', to: 'pcb', label: 'Encoder và ALM',
    carries: 'Tín hiệu encoder EA/EB của mỗi động cơ, đấu song song với driver, vào AM26LV32E rồi tới timer của STM32. ALM báo khi driver lỗi.',
    level: 'Vi sai → 3,3 V', pins: 'Trái: PB4 · PB5 (TIM3) · Phải: PC6 · PB8 (TIM8) · ALM: PC10 · PC11',
    routes: [
      [[0.118, 0.289, -0.29], [0.118, 0.362, -0.29], [0.118, 0.362, -0.148], [0.047, 0.362, -0.148]],
      [[-0.118, 0.289, -0.29], [-0.118, 0.362, -0.29], [-0.118, 0.362, -0.19], [-0.048, 0.362, -0.19], [-0.048, 0.366, -0.16]],
    ],
  },
  {
    id: 'motor-driver', kind: 'feedback', from: 'motor', to: 'driver', label: 'Encoder động cơ',
    carries: 'Encoder gắn sau trục động cơ báo vị trí thật về driver, để driver tự bù khi trễ bước.', level: 'EA± · EB± vi sai',
    routes: [
      [[0.128, 0.1, -0.029], [0.128, 0.115, -0.255], [0.128, 0.234, -0.255]],
      [[-0.128, 0.1, -0.029], [-0.128, 0.115, -0.255], [-0.128, 0.234, -0.255]],
    ],
  },
  {
    id: 'sonar-pcb', kind: 'feedback', back: 'command', from: 'sonar', to: 'pcb', label: 'TRIG / ECHO ×4',
    carries: 'STM32 gửi xung TRIG ra từng cảm biến; xung ECHO quay về dài đúng bằng thời gian sóng dội.',
    level: '5 V', pins: 'TRIG: PB0 · PB11 · PB13 · PB15 · ECHO: PB1 · PB12 · PB14 · PA6',
    routes: [
      [[0.263, 0.23, 0.383], [0.263, 0.337, 0.383], [0.263, 0.337, 0.23], [0.08, 0.337, 0.23], [0.08, 0.337, -0.11], [0.047, 0.366, -0.11]],
      [[-0.263, 0.23, 0.383], [-0.263, 0.337, 0.383], [-0.263, 0.337, 0.23], [-0.07, 0.337, 0.23], [-0.07, 0.337, -0.11], [-0.048, 0.366, -0.11]],
      [[0.263, 0.23, -0.383], [0.263, 0.337, -0.383], [0.263, 0.337, -0.23], [0.086, 0.337, -0.23], [0.086, 0.337, -0.135], [0.047, 0.366, -0.135]],
      [[-0.263, 0.23, -0.383], [-0.263, 0.337, -0.383], [-0.263, 0.337, -0.23], [-0.076, 0.337, -0.23], [-0.076, 0.337, -0.135], [-0.048, 0.366, -0.135]],
    ],
  },
  {
    id: 'lidar-pc', kind: 'feedback', from: 'lidar', to: 'pc', label: 'USB · /scan',
    carries: 'Từng vòng quét khoảng cách quanh robot.', level: 'USB',
    routes: [[[-0.03, 0.455, 0.022], [-0.075, 0.455, 0.022], [-0.075, 0.38, 0.022], [-0.058, 0.38, 0.022]]],
  },
  {
    id: 'camera-pc', kind: 'feedback', from: 'camera', to: 'pc', label: 'USB · màu và độ sâu',
    carries: 'Ảnh màu và ảnh độ sâu phía trước robot.', level: 'USB',
    routes: [[[0.03, 0.27, 0.335], [0.03, 0.345, 0.335], [0.03, 0.345, 0.07], [0.03, 0.37, 0.051]]],
  },

  // Video.
  {
    id: 'quest-pc', kind: 'video', back: 'low', from: 'quest', to: 'pc', label: 'USB-C · ADB',
    carries: 'Luồng H.264 từ kính xuống máy tính; điện sạc từ máy tính lên kính.', level: 'USB',
    routes: [[[-0.097, 1.18, 0.02], [-0.11, 1.18, 0.02], [-0.11, 0.49, 0.02], [-0.04, 0.49, 0.02], [-0.04, 0.396, 0.02]]],
  },
  {
    id: 'pc-tour', kind: 'video', from: 'pc', to: 'tour', label: 'Wi-Fi · WebRTC', dashed: true,
    carries: 'Hình đã cắt và nén phát qua Wi-Fi, tới trình duyệt của học sinh.', level: 'Không dây',
    routes: [[[0.05, 0.396, -0.04], [0.22, 0.62, -0.2], [0.36, 1.08, -0.34]]],
  },
]

export function wiresOf(id: InsideId): InsideWire[] {
  return WIRES.filter(wire => wire.from === id || wire.to === id)
}

export function wire(id: string): InsideWire | undefined {
  return WIRES.find(item => item.id === id)
}

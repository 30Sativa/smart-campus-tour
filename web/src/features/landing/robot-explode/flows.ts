/**
 * How signals and power move through the CampusTour robot, step by step, for
 * the "Bên trong robot" section of the public Home page. Modelled on the
 * robot's real wiring and protocol: `robot/docs/PROTOCOL_FB.md` (USB CDC
 * between the mini PC and the STM32G431), `robot/quest-stream/README.md`
 * (Quest 3 video path) and the PCB connector names in the SolidWorks model.
 *
 * Each diagram node maps to a group of the 3D model (`parts.ts`) where its
 * signal starts or ends; `cloud` (the students' tour page) is off the robot.
 */
import type { PartGroupId } from './parts'

/** red: a command going out; blue: a reading coming back; amber: power; violet: video. */
export type SignalKind = 'command' | 'feedback' | 'power' | 'video'

export const SIGNAL_KINDS: readonly { kind: SignalKind; label: string; color: string }[] = [
  { kind: 'command', label: 'Lệnh điều khiển', color: '#e5554a' },
  { kind: 'feedback', label: 'Tín hiệu báo về', color: '#3d8fe0' },
  { kind: 'power', label: 'Nguồn điện', color: '#e2a72e' },
  { kind: 'video', label: 'Hình ảnh', color: '#8b63d8' },
]

export function signalColor(kind: SignalKind): string {
  return SIGNAL_KINDS.find(item => item.kind === kind)!.color
}

export type FlowNodeId =
  | 'lidar' | 'camera' | 'quest' | 'sonar' | 'sr04t' | 'imu' | 'battery'
  | 'pc' | 'mcu'
  | 'driver' | 'motor' | 'drv' | 'pantilt' | 'contactor' | 'cloud'

export type FlowNode = {
  id: FlowNodeId
  label: string
  /** Part number or interface, the small second line of the box. */
  detail: string
  /** Column of the signal diagram: what feeds in, the two computers, what they drive. */
  column: 'in' | 'brain' | 'out'
  /** Where the node sits in the 3D model; null when it is off the robot. */
  part: PartGroupId | null
  /** Only these pieces of the part (by node name), when the part holds more than this node. */
  pieces?: readonly string[]
}

export const FLOW_NODES: readonly FlowNode[] = [
  { id: 'lidar', label: 'LiDAR', detail: 'RPLiDAR · USB', column: 'in', part: 'lidar' },
  { id: 'camera', label: 'Camera phía trước', detail: 'Ảnh độ sâu · USB', column: 'in', part: 'camera' },
  { id: 'quest', label: 'Kính Meta Quest 3', detail: 'H.264 · USB/ADB', column: 'in', part: 'quest' },
  { id: 'sonar', label: 'Đầu dò siêu âm ×4', detail: 'JSN-SR04T · chống nước', column: 'in', part: 'sonar', pieces: ['sonar__05', 'sonar__06', 'sonar__07', 'sonar__08'] },
  { id: 'sr04t', label: 'Mạch SR04T ×4', detail: 'Đo thời gian sóng dội', column: 'in', part: 'sonar', pieces: ['sonar__01', 'sonar__02', 'sonar__03', 'sonar__04'] },
  { id: 'imu', label: 'IMU', detail: 'BNO085 · trên mạch', column: 'in', part: 'pcb' },
  { id: 'battery', label: 'Pin', detail: 'Nguồn chính', column: 'in', part: 'battery' },
  { id: 'pc', label: 'Mini PC', detail: 'Beelink · ROS 2 · Nav2', column: 'brain', part: 'pc' },
  { id: 'mcu', label: 'STM32G431', detail: 'Mạch điều khiển', column: 'brain', part: 'pcb' },
  { id: 'driver', label: 'Driver HBS86H ×2', detail: 'STEP / DIR', column: 'out', part: 'driver' },
  { id: 'motor', label: 'Động cơ 57HS22 ×2', detail: '2,2 N·m', column: 'out', part: 'motor' },
  { id: 'drv', label: 'Driver pan/tilt ×2', detail: 'STEP · nEN', column: 'out', part: 'drv' },
  { id: 'pantilt', label: 'Đầu pan–tilt', detail: 'Pan 0,6° · tilt 1,8°/bước', column: 'out', part: 'pantilt' },
  { id: 'contactor', label: 'Contactor', detail: 'MOSFET · PA10', column: 'out', part: 'pcb' },
  { id: 'cloud', label: 'Trang tour', detail: 'WebRTC · học sinh', column: 'out', part: null },
]

export function flowNode(id: FlowNodeId): FlowNode {
  return FLOW_NODES.find(node => node.id === id)!
}

export type FlowLink = { from: FlowNodeId; to: FlowNodeId; kind: SignalKind; label: string }

/** What moves in the 3D model while the step is shown. */
export type FlowMotion = 'wheels' | 'lidar' | 'head' | 'sonar'

export type FlowStep = {
  title: string
  /** Body text; `[[words|kind]]` underlines words in that signal's colour. */
  body: string
  /** Protocol-level detail, shown under "Chi tiết tín hiệu". */
  signal: string
  links: readonly FlowLink[]
  /** Extra parts lit up besides the ends of the links. */
  parts?: readonly PartGroupId[]
  motion?: FlowMotion
}

export type Flow = { id: string; label: string; summary: string; steps: readonly FlowStep[] }

const CMD_USB: FlowLink = { from: 'pc', to: 'mcu', kind: 'command', label: 'USB CDC' }
const FB_USB: FlowLink = { from: 'mcu', to: 'pc', kind: 'feedback', label: 'Khung FB · 50 Hz' }

export const FLOWS: readonly Flow[] = [
  {
    id: 'drive',
    label: 'Di chuyển',
    summary: 'Từ máy tính tới bánh xe',
    steps: [
      {
        title: 'Máy tính gửi lệnh tốc độ',
        body: '[[Mini PC|command]] chạy ROS 2 và Nav2: từ bản đồ và vị trí hiện tại, nó tính tốc độ bánh trái, bánh phải rồi gửi xuống [[mạch điều khiển STM32|command]] qua cáp USB.',
        signal: 'USB CDC: CMD,<seq>,<trái mm/s>,<phải mm/s>. Lệnh phải tới đều; im quá 300 ms là watchdog trên STM32 cắt động cơ.',
        links: [CMD_USB],
      },
      {
        title: 'Mạch điều khiển phát xung',
        body: 'STM32 đổi tốc độ thành chuỗi [[xung STEP và chiều DIR|command]] cho hai [[driver HBS86H|command]], mỗi driver lo một bánh.',
        signal: 'Mỗi xung STEP là một bước của động cơ; tần số xung quyết định tốc độ, mức DIR quyết định chiều quay.',
        links: [{ from: 'mcu', to: 'driver', kind: 'command', label: 'STEP / DIR' }],
      },
      {
        title: 'Động cơ quay bánh xe',
        body: 'Mỗi [[HBS86H|command]] cấp dòng vào hai cuộn dây của một [[động cơ bước 57HS22|command]]. Dòng tới là trục động cơ quay từng bước, kéo [[bánh xe chủ động|command]] ở giữa quay theo; hai bánh quay khác tốc độ thì robot rẽ, bốn bánh phụ ở góc chỉ lăn theo.',
        signal: 'Động cơ 57 mm, mô-men giữ 2,2 N·m; robot đi tối đa khoảng 0,20 m/s theo cấu hình Nav2. Điện cho driver đi qua contactor (xem Nguồn điện).',
        links: [{ from: 'driver', to: 'motor', kind: 'command', label: 'Dòng pha A/B' }],
        parts: ['wheel'],
        motion: 'wheels',
      },
    ],
  },
  {
    id: 'sense',
    label: 'Cảm biến & định vị',
    summary: 'Từ cảm biến về máy tính',
    steps: [
      {
        title: 'LiDAR quét quanh robot',
        body: '[[LiDAR|feedback]] quay tròn đo khoảng cách tới tường và vật cản quanh robot, rồi gửi từng vòng quét qua USB về [[Mini PC|feedback]].',
        signal: 'Topic /scan trong ROS 2; góc lắp LiDAR được khai báo bằng tham số lidar_yaw khi khởi động.',
        links: [{ from: 'lidar', to: 'pc', kind: 'feedback', label: 'USB · /scan' }],
        motion: 'lidar',
      },
      {
        title: 'Siêu âm đo vật cản qua SR04T',
        body: 'Bốn [[đầu dò siêu âm|feedback]] ở bốn góc phát một chùm sóng ra ngoài rồi nghe sóng dội lại từ vật cản; [[mạch SR04T|feedback]] đi kèm mỗi đầu dò đo thời gian từ lúc phát tới lúc nghe thấy.',
        signal: 'Sóng 40 kHz; vật càng xa thì sóng dội về càng lâu. JSN-SR04T đo được khoảng 0,25–4,5 m.',
        links: [{ from: 'sonar', to: 'sr04t', kind: 'feedback', label: 'Sóng dội' }],
        motion: 'sonar',
      },
      {
        title: 'SR04T chuyển vào STM32',
        body: '[[STM32|feedback]] phát xung Trig cho từng [[mạch SR04T|feedback]]; mạch trả về xung Echo dài đúng bằng thời gian sóng đi và về, STM32 đổi độ dài đó thành khoảng cách.',
        signal: 'Trig / Echo; khoảng cách (mm) ≈ thời gian Echo (µs) × 0,343 ÷ 2.',
        links: [{ from: 'sr04t', to: 'mcu', kind: 'feedback', label: 'Trig / Echo' }],
      },
      {
        title: 'STM32 gửi lên Mini PC',
        body: 'STM32 đóng bốn khoảng cách vào [[khung FB|feedback]] và gửi qua USB lên [[Mini PC|feedback]]; máy tính dùng chúng để tránh vật cản ở gần mà LiDAR khó thấy.',
        signal: 'Mỗi cảm biến cho một cặp <mm>,<hợp lệ> trong khung FB (SONAR1–4), 50 lần mỗi giây.',
        links: [FB_USB],
        parts: ['sonar'],
      },
      {
        title: 'IMU đo hướng quay',
        body: 'Cảm biến [[IMU BNO085|feedback]] trên mạch điều khiển đo hướng của robot; [[STM32|feedback]] đọc góc quay (yaw) và độ tin cậy của nó rồi gửi lên [[Mini PC|feedback]] để xử lí.',
        signal: 'yaw_cdeg (×0,01°) và yaw_acc 0–3 trong khung FB; yaw_acc = 0 nghĩa là từ kế chưa hiệu chuẩn.',
        links: [{ from: 'imu', to: 'mcu', kind: 'feedback', label: 'Yaw' }, FB_USB],
      },
      {
        title: 'Máy tính ghép lại để định vị',
        body: 'STM32 gộp siêu âm và hướng vào [[khung FB|feedback]]; [[camera phía trước|feedback]] gửi ảnh độ sâu. [[Mini PC|feedback]] ghép tất cả với LiDAR để biết robot đang ở đâu trên bản đồ và lập đường đi.',
        signal: 'AMCL định vị trên bản đồ; robot_localization ghép yaw với vận tốc bánh; Nav2 lập đường đi.',
        links: [FB_USB, { from: 'camera', to: 'pc', kind: 'feedback', label: 'USB · ảnh độ sâu' }, { from: 'lidar', to: 'pc', kind: 'feedback', label: 'USB · /scan' }],
        motion: 'lidar',
      },
    ],
  },
  {
    id: 'head',
    label: 'Quay đầu camera',
    summary: 'Từ máy tính tới đầu pan–tilt',
    steps: [
      {
        title: 'Máy tính chọn góc nhìn',
        body: 'Ở mỗi điểm dừng, [[Mini PC|command]] gửi lệnh [[HEAD|command]] với góc quay ngang (pan) và góc gật (tilt) cần tới.',
        signal: 'HEAD,<seq>,<pan ×0,01°>,<tilt ×0,01°>; còn có HOME, ZERO, STEP, JOG, STOP và OFF.',
        links: [{ from: 'pc', to: 'mcu', kind: 'command', label: 'USB CDC · HEAD' }],
        motion: 'head',
      },
      {
        title: 'Xung cho hai trục',
        body: 'STM32 chạy biên dạng tốc độ hình thang và phát xung cho hai [[mạch driver bước|command]], một cho trục pan, một cho trục tilt.',
        signal: 'Driver bật bằng chân nEN; tắt driver (OFF) thì motor thả trôi và đầu mất mốc 0.',
        links: [{ from: 'mcu', to: 'drv', kind: 'command', label: 'STEP · DIR' }],
        motion: 'head',
      },
      {
        title: 'Đầu quay theo',
        body: 'Motor trong [[cụm pan–tilt|command]] quay đầu tới góc đặt; [[kính Quest 3|command]] trên đầu quay theo nên góc nhìn của học sinh đổi theo.',
        signal: 'Mỗi bước: pan 0,6° (hộp số 3:1), tilt 1,8°. Giới hạn mềm pan ±170°, tilt ±18°.',
        links: [{ from: 'drv', to: 'pantilt', kind: 'command', label: 'Động cơ bước' }],
        parts: ['head', 'quest'],
        motion: 'head',
      },
      {
        title: 'Báo góc về máy tính',
        body: 'Góc pan và tilt, tính từ số xung đã phát, được gửi về trong [[khung FB|feedback]] cùng trạng thái của đầu quay.',
        signal: 'pan_cdeg, tilt_cdeg và head_state: 0 OFF, 1 IDLE, 2 MOVING, 3 HOMING, 4 NO_REF.',
        links: [FB_USB],
        parts: ['pantilt', 'head', 'quest'],
        motion: 'head',
      },
    ],
  },
  {
    id: 'video',
    label: 'Nguồn hình',
    summary: 'Từ kính Quest 3 tới học sinh',
    steps: [
      {
        title: 'Kính ghi lại góc nhìn',
        body: '[[Kính Meta Quest 3|video]] cắm USB vào [[Mini PC|video]]; máy đọc thẳng luồng hình của kính qua ADB, không ghi ra file.',
        signal: 'adb exec-out screenrecord: H.264 hai mắt, đọc qua ống dẫn (pipe).',
        links: [{ from: 'quest', to: 'pc', kind: 'video', label: 'USB · ADB' }],
      },
      {
        title: 'Cắt và chuẩn hoá hình',
        body: 'FFmpeg trên Mini PC lấy [[hình mắt trái|video]], cắt khung 16:9 ở giữa thành 1280×720, 30 khung mỗi giây.',
        signal: 'H.264 constrained baseline, không B-frame, keyframe mỗi giây; đẩy vào MediaMTX qua RTSP trong máy.',
        links: [{ from: 'quest', to: 'pc', kind: 'video', label: 'H.264' }],
      },
      {
        title: 'Phát tới học sinh',
        body: 'MediaMTX phát luồng qua [[WebRTC|video]] tới [[trang tour|video]] của từng học sinh, trễ dưới một giây.',
        signal: 'WHEP trên cổng 8889, HLS làm đường dự phòng; muốn ra Internet thì đẩy qua máy chủ relay.',
        links: [{ from: 'pc', to: 'cloud', kind: 'video', label: 'WebRTC' }],
      },
    ],
  },
  {
    id: 'power',
    label: 'Nguồn điện',
    summary: 'Từ pin tới từng cụm',
    steps: [
      {
        title: 'Đường điện từ pin',
        body: 'Điện đi ra từ [[pin|power]] tới [[Mini PC|power]], từ Mini PC qua cổng USB tới [[mạch STM32|power]]; STM32 bật [[contactor|command]] để điện đi tiếp tới hai [[driver HBS86H|power]].',
        signal: 'Mức pin được báo cho đội vận hành theo dõi trong suốt chuyến tham quan; contactor do chân PA10 của STM32 điều khiển.',
        links: [
          { from: 'battery', to: 'pc', kind: 'power', label: 'Nguồn' },
          { from: 'pc', to: 'mcu', kind: 'power', label: 'USB' },
          { from: 'mcu', to: 'contactor', kind: 'command', label: 'PA10' },
          { from: 'contactor', to: 'driver', kind: 'power', label: 'Nguồn động cơ' },
        ],
      },
      {
        title: 'Contactor đóng mạch động cơ',
        body: 'STM32 bật [[MOSFET contactor|command]] ngay khi khởi động, nối [[nguồn pin|power]] sang khối động cơ.',
        signal: 'CONTACTOR,<seq>,ON / OFF điều khiển chân PA10; từ 05/11/2026 contactor bật ngay khi STM32 khởi động.',
        links: [{ from: 'mcu', to: 'contactor', kind: 'command', label: 'PA10' }, { from: 'battery', to: 'contactor', kind: 'power', label: 'Nguồn động cơ' }],
      },
      {
        title: 'Động cơ có điện',
        body: 'Qua contactor, điện tới hai [[driver HBS86H|power]] rồi tới động cơ. Lệnh dừng hay watchdog chỉ dừng động cơ, không tự ngắt contactor.',
        signal: 'Muốn cắt hẳn điện động cơ thì máy tính gửi CONTACTOR,<seq>,OFF.',
        links: [{ from: 'contactor', to: 'driver', kind: 'power', label: 'Nguồn động cơ' }, { from: 'driver', to: 'motor', kind: 'power', label: 'Dòng pha' }],
      },
    ],
  },
]

export type BodyPart = { text: string; kind?: SignalKind }

const KINDS = new Set<string>(SIGNAL_KINDS.map(item => item.kind))

/** Splits `[[words|kind]]` markup into plain and underlined runs. */
export function parseBody(body: string): BodyPart[] {
  const parts: BodyPart[] = []
  const pattern = /\[\[([^|\]]+)\|([^\]]+)\]\]/g
  let last = 0
  for (const match of body.matchAll(pattern)) {
    if (match.index > last) parts.push({ text: body.slice(last, match.index) })
    const kind = match[2]
    parts.push(KINDS.has(kind) ? { text: match[1], kind: kind as SignalKind } : { text: match[1] })
    last = match.index + match[0].length
  }
  if (last < body.length) parts.push({ text: body.slice(last) })
  return parts
}

/** The model parts a step lights up: both ends of every link plus its extra parts. */
export function stepParts(step: FlowStep): PartGroupId[] {
  const parts = new Set<PartGroupId>(step.parts ?? [])
  for (const link of step.links) {
    for (const id of [link.from, link.to]) {
      const part = flowNode(id).part
      if (part) parts.add(part)
    }
  }
  return [...parts]
}

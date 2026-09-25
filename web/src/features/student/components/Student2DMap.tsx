import { AlertTriangle, Compass } from 'lucide-react'
import type { PoiDetail, StudentRobotPose } from '../student-types'

interface Student2DMapProps {
  pois: PoiDetail[]
  currentPoi?: PoiDetail
  nextPoi?: PoiDetail
  robotPose?: StudentRobotPose
}

/** Home-page palette: ink ground, lime route and current stop, amber next stop. */
const C = {
  ground: '#161616',
  grid: 'rgba(255, 255, 255, 0.05)',
  building: '#262626',
  buildingLine: '#3a3a3a',
  label: '#a2a3a8',
  lime: '#bde74e',
  amber: '#e0a02a',
  white: '#ffffff',
  water: '#1f2a22',
}

export function Student2DMap({
  pois,
  currentPoi,
  nextPoi,
  robotPose = { x: 50, y: 50, heading: 0, isStale: false, lastUpdatedAt: '' },
}: Student2DMapProps) {
  // Toạ độ bản đồ từ 0 đến 100% -> nhân tỉ lệ lên viewBox 1000 x 700
  const scaleX = (val: number) => (val / 100) * 1000
  const scaleY = (val: number) => (val / 100) * 700

  const robotX = scaleX(robotPose.x)
  const robotY = scaleY(robotPose.y)

  // Tuyến đường nối các POI
  const routePoints = pois.map((p) => `${scaleX(p.x)},${scaleY(p.y)}`).join(' ')

  return (
    <div className="st-map">
      <div className="st-map__head">
        <span className="st-mono"><Compass size={15} />Bản đồ 2D Khuôn viên (Thời gian thực)</span>
        {robotPose.isStale && (
          <span className="st-map__stale">
            <AlertTriangle size={12} />
            <span>Vị trí tạm gián đoạn</span>
          </span>
        )}
      </div>

      <div className="st-map__canvas">
        <svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Bản đồ khuôn viên với vị trí robot và các điểm tham quan">
          <defs>
            <pattern id="campus-grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke={C.grid} strokeWidth="1" />
            </pattern>
            <radialGradient id="robot-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={C.lime} stopOpacity="0.55" />
              <stop offset="100%" stopColor={C.lime} stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect width="1000" height="700" fill={C.ground} />
          <rect width="1000" height="700" fill="url(#campus-grid)" />

          {/* Khu Công viên / Hồ trung tâm */}
          <path d="M 380 280 C 450 260, 560 300, 540 400 C 510 480, 420 460, 370 420 Z" fill={C.water} stroke="#33452f" strokeWidth="1.5" />
          <text x="455" y="370" fill="#7f9a5a" fontSize="13" textAnchor="middle">Hồ Sen Sinh Thái</text>

          <rect x="80" y="350" width="160" height="110" rx="8" fill={C.building} stroke={C.buildingLine} strokeWidth="2" />
          <text x="160" y="410" fill={C.label} fontSize="13" textAnchor="middle">Giảng Đường A</text>

          <rect x="420" y="100" width="200" height="130" rx="10" fill={C.building} stroke={C.buildingLine} strokeWidth="2" />
          <text x="520" y="170" fill={C.label} fontSize="14" textAnchor="middle">Thư Viện Thông Minh</text>

          <rect x="720" y="80" width="200" height="150" rx="10" fill={C.building} stroke={C.buildingLine} strokeWidth="2" />
          <text x="820" y="160" fill={C.label} fontSize="13" textAnchor="middle">Khu Hiệu Bộ</text>

          <rect x="720" y="440" width="180" height="160" rx="12" fill={C.building} stroke={C.buildingLine} strokeWidth="2" />
          <text x="810" y="525" fill={C.label} fontSize="13" textAnchor="middle">Khu Thể Thao</text>

          {/* Tuyến đường */}
          <polyline points={routePoints} fill="none" stroke={C.lime} strokeWidth="3" strokeDasharray="8 9" strokeLinecap="round" opacity="0.85" />

          {/* Điểm POI */}
          {pois.map((poi) => {
            const isCurrent = currentPoi?.id === poi.id
            const isNext = nextPoi?.id === poi.id
            const px = scaleX(poi.x)
            const py = scaleY(poi.y)

            return (
              <g key={poi.id}>
                {isCurrent && <circle cx={px} cy={py} r="16" fill={C.lime} opacity="0.35" className="st-map__ping" />}
                <circle
                  cx={px}
                  cy={py}
                  r="15"
                  fill={isCurrent ? C.lime : isNext ? C.amber : '#1c1c1c'}
                  stroke={isCurrent ? C.lime : isNext ? C.amber : '#5a5a5a'}
                  strokeWidth="2"
                />
                <text x={px} y={py + 4.5} fill={isCurrent || isNext ? '#1c1c1c' : C.white} fontSize="12" fontWeight="600" textAnchor="middle">
                  {poi.order}
                </text>
                <text x={px} y={py + 34} fill={isCurrent ? C.lime : '#d6d7da'} fontSize="13" fontWeight={isCurrent ? 600 : 400} textAnchor="middle">
                  {poi.title}
                </text>
              </g>
            )
          })}

          {/* Robot */}
          <g transform={`translate(${robotX}, ${robotY})`}>
            <circle cx="0" cy="0" r="36" fill="url(#robot-glow)" />
            <g transform={`rotate(${robotPose.heading})`}>
              <path d="M 0 0 L -18 -44 L 18 -44 Z" fill={C.lime} opacity="0.3" />
              <line x1="0" y1="0" x2="0" y2="-36" stroke={C.lime} strokeWidth="2.5" strokeLinecap="round" />
            </g>
            <circle cx="0" cy="0" r="13" fill={C.white} stroke={C.lime} strokeWidth="3" />
            <circle cx="0" cy="0" r="4.5" fill="#1c1c1c" />
            <text x="0" y="28" fill={C.white} fontSize="11" fontFamily="ui-monospace, monospace" textAnchor="middle">
              ROBOT AMR
            </text>
          </g>
        </svg>
      </div>

      <div className="st-map__foot">
        <div className="st-legend">
          <span><i style={{ background: '#bde74e' }} />Điểm hiện tại</span>
          <span><i style={{ background: '#e0a02a' }} />Điểm kế tiếp</span>
          <span><i style={{ background: '#fff', boxShadow: '0 0 0 2px #bde74e' }} />Robot AMR</span>
          <span><i className="st-legend__route" />Tuyến đường</span>
        </div>
        <span className="st-mono" style={{ fontSize: 10 }}>Tọa độ thực từ ROS 2 Nav2</span>
      </div>
    </div>
  )
}

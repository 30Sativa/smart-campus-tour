/**
 * RobotIllustration — SMARTBUS AMR thực tế của dự án
 *
 * Kết hợp:
 * - Ảnh robot thật (/smartbus-robot.jpg)
 * - SVG overlay: LiDAR scan rings, LED glow, route path, floating badge
 * - CSS animations: robot lăn + lơ lửng, bánh xe quay, đèn LED nhấp nháy,
 *   LiDAR quét, bóng đổ, route path chạy, status badge nhấp nhô
 *
 * Để nhúng Spline 3D: xoá toàn bộ component này và thay bằng <iframe> trong
 * PublicHomePage.tsx tại #spline-area.
 */
export function RobotIllustration() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-end"
      style={{ paddingRight: '4%' }}
    >
      {/* ── Outer wrapper: chứa robot + tất cả SVG overlay ── */}
      <div
        className="relative"
        style={{ width: 420, height: 500 }}
        aria-label="Robot SMARTBUS đang hoạt động"
      >

        {/* ════════════════════════════════════════
            TẦNG 0 — Campus map / route SVG (dưới cùng)
        ════════════════════════════════════════ */}
        <svg
          className="absolute bottom-0 left-1/2"
          style={{ transform: 'translateX(-50%)', zIndex: 1 }}
          width="420"
          height="140"
          viewBox="0 0 420 140"
          fill="none"
          aria-hidden="true"
        >
          {/* Grid sàn */}
          <g opacity="0.12" stroke="#6b7280" strokeWidth="0.8">
            {[0, 60, 120, 180, 240, 300, 360, 420].map(x => (
              <line key={`v${x}`} x1={x} y1="10" x2={x} y2="140" />
            ))}
            {[30, 60, 90, 110, 130].map(y => (
              <line key={`h${y}`} x1="0" y1={y} x2="420" y2={y} />
            ))}
          </g>

          {/* Route path đang chạy animation */}
          <path
            d="M 40 125 Q 100 90 180 80 Q 260 72 340 90 Q 380 100 400 115"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeDasharray="120 120"
            strokeLinecap="round"
            fill="none"
            opacity="0.5"
            className="dot-move"
          />
          {/* Điểm bắt đầu */}
          <circle cx="40" cy="125" r="5" fill="#3b82f6" opacity="0.6" />
          {/* Điểm đích */}
          <g transform="translate(400, 108)">
            <circle cx="0" cy="-7" r="7" fill="#0d0d0d" opacity="0.75" />
            <circle cx="0" cy="-7" r="3" fill="white" />
            <line x1="0" y1="0" x2="0" y2="4" stroke="#0d0d0d" strokeWidth="2" />
          </g>
        </svg>

        {/* ════════════════════════════════════════
            TẦNG 1 — Bóng đổ dưới robot (co giãn theo float)
        ════════════════════════════════════════ */}
        <div
          className="shadow-pulse absolute"
          aria-hidden="true"
          style={{
            bottom: 72,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 260,
            height: 28,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.22) 0%, transparent 70%)',
            zIndex: 2,
          }}
        />

        {/* ════════════════════════════════════════
            TẦNG 2 — Robot image (animated drive)
        ════════════════════════════════════════ */}
        <div
          className="robot-drive absolute"
          style={{
            bottom: 78,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            width: 300,
          }}
        >
          {/* ── Ảnh robot thực ── */}
          <img
            src="/smartbus-robot.jpg"
            alt="SMARTBUS autonomous mobile robot"
            draggable={false}
            style={{
              width: '100%',
              userSelect: 'none',
              filter: 'drop-shadow(0 16px 40px rgba(0,0,0,0.18))',
            }}
          />

          {/* ── SVG overlay: LiDAR + LED + screen effects ── */}
          <svg
            className="absolute inset-0"
            width="100%"
            height="100%"
            viewBox="0 0 300 280"
            fill="none"
            aria-hidden="true"
            style={{ pointerEvents: 'none' }}
          >
            {/* LED xanh viền (glow strip) */}
            <rect
              x="18" y="138" width="148" height="5" rx="2.5"
              fill="#3b82f6"
              className="led-pulse"
            />

            {/* LiDAR scan rings — toả ra từ đỉnh giữa robot */}
            <g transform="translate(164, 28)">
              {/* Lõi LiDAR */}
              <circle cx="0" cy="0" r="10" fill="#1e293b" opacity="0.85" />
              <circle cx="0" cy="0" r="5" fill="#334155" />
              {/* Tia quét xoay */}
              <g className="lidar-spin" style={{ transformOrigin: '0 0' }}>
                <line x1="0" y1="0" x2="18" y2="0" stroke="#3b82f6" strokeWidth="1.5" opacity="0.8" strokeLinecap="round" />
              </g>
              {/* Vòng scan toả ra */}
              <circle cx="0" cy="0" r="14" stroke="#3b82f6" strokeWidth="1.2" fill="none" className="scan-ring" />
              <circle cx="0" cy="0" r="14" stroke="#3b82f6" strokeWidth="1.2" fill="none" className="scan-ring-2" />
              <circle cx="0" cy="0" r="14" stroke="#3b82f6" strokeWidth="1.2" fill="none" className="scan-ring-3" />
            </g>

            {/* Nút khẩn cấp (đỏ) nhấp nháy */}
            <circle
              cx="68" cy="22" r="9"
              fill="#ef4444"
              className="emergency-blink"
              style={{ filter: 'drop-shadow(0 0 4px #ef4444)' }}
            />
            <circle cx="68" cy="22" r="4" fill="#fca5a5" opacity="0.7" className="emergency-blink" />

            {/* Màn hình LED — mặt cười (eyes blink) */}
            <g transform="translate(26, 70)" className="screen-blink">
              {/* Eyes */}
              <g className="eye-blink" style={{ transformOrigin: '28px 22px' }}>
                {/* Eye L dots */}
                {[0,1,2].map(r => [0,1,2].map(c => (
                  <rect key={`el${r}${c}`}
                    x={20 + c * 6} y={16 + r * 5}
                    width="4" height="4" rx="1"
                    fill="#3b82f6" opacity={r === 2 && c === 1 ? 0 : 0.9}
                  />
                )))}
              </g>
              <g className="eye-blink" style={{ transformOrigin: '56px 22px', animationDelay: '0.3s' }}>
                {/* Eye R dots */}
                {[0,1,2].map(r => [0,1,2].map(c => (
                  <rect key={`er${r}${c}`}
                    x={48 + c * 6} y={16 + r * 5}
                    width="4" height="4" rx="1"
                    fill="#3b82f6" opacity={r === 2 && c === 1 ? 0 : 0.9}
                  />
                )))}
              </g>
              {/* Smile arc dots */}
              {[
                [22, 48], [26, 52], [30, 55], [34, 56],
                [38, 55], [42, 52], [46, 48],
              ].map(([x, y], i) => (
                <rect key={`s${i}`} x={x} y={y} width="4" height="4" rx="1" fill="#3b82f6" opacity="0.9" />
              ))}
            </g>
          </svg>

          {/* ── Bánh xe quay (overlay divs) ── */}
          {/* Bánh trước trái */}
          <div
            className="wheel-spin absolute"
            style={{
              bottom: 18, left: 22,
              width: 52, height: 52,
              borderRadius: '50%',
              border: '6px solid #1a1a1a',
              borderTopColor: '#e5e7eb',
              zIndex: 15,
            }}
          />
          {/* Bánh sau trái */}
          <div
            className="wheel-spin absolute"
            style={{
              bottom: 18, right: 22,
              width: 52, height: 52,
              borderRadius: '50%',
              border: '6px solid #1a1a1a',
              borderTopColor: '#e5e7eb',
              zIndex: 15,
              animationDirection: 'reverse',
            }}
          />
        </div>
        {/* end robot-drive */}

        {/* ════════════════════════════════════════
            TẦNG 3 — Floating status badge (phía trên robot)
        ════════════════════════════════════════ */}
        <div
          className="label-bob absolute"
          style={{
            top: 28,
            left: '50%',
            transform: 'translateX(-70%)',
            zIndex: 20,
          }}
          aria-live="polite"
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.9)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
              borderRadius: '9999px',
              padding: '7px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 8px rgba(34,197,94,0.8)',
                flexShrink: 0,
                display: 'block',
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
              Đang dẫn đường
            </span>
          </div>
        </div>

        {/* Speed badge */}
        <div
          className="label-bob absolute"
          style={{
            top: 80,
            right: 10,
            zIndex: 20,
            animationDelay: '1.5s',
          }}
        >
          <div
            style={{
              background: '#0d0d0d',
              borderRadius: 12,
              padding: '6px 12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
              0.8
            </span>
            <span style={{ fontSize: 9, fontWeight: 500, color: '#9ca3af', letterSpacing: '0.05em' }}>
              m/s
            </span>
          </div>
        </div>

        {/* ════════════════════════════════════════
            TẦNG 4 — Vệt chuyển động bên trái robot
        ════════════════════════════════════════ */}
        <div
          className="absolute"
          aria-hidden="true"
          style={{
            bottom: 115,
            left: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            zIndex: 5,
          }}
        >
          {[44, 30, 18].map((w, i) => (
            <div
              key={i}
              style={{
                height: 2,
                width: w,
                borderRadius: 9999,
                background: 'rgba(107,114,128,0.35)',
                animation: `motionStreak 1.8s ease-in-out infinite`,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>

      </div>
      {/* end outer wrapper */}

    </div>
  )
}

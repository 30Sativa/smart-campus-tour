/** 3 glassmorphism feature cards — bottom of hero */
export function FeatureCards() {
  return (
    <section
      id="features"
      className="relative z-20 mt-8 pb-16 md:pb-24"
      aria-label="Tính năng nổi bật"
    >
      <div className="cards-grid">

        {/* ── Card 1: Robot dẫn đường ── */}
        <article
          id="card-robot-guide"
          className="glass card-lift rounded-[2rem] p-7 flex flex-col gap-5"
        >
          {/* Icon */}
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center flex-shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 2a3 3 0 013 3v1h2a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V8a2 2 0 012-2h2V5a3 3 0 013-3z"
                stroke="#374151" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
              />
              <circle cx="9.5" cy="12" r="1.5" fill="#374151" />
              <circle cx="14.5" cy="12" r="1.5" fill="#374151" />
              <path d="M9 16h6" stroke="#374151" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>

          <div className="flex flex-col gap-2 flex-1">
            <h3 className="text-[17px] font-bold text-[#0d0d0d] leading-tight tracking-tight">
              Robot<br />dẫn đường
            </h3>
            <p className="text-[13px] text-gray-500 leading-relaxed">
              Robot mini có khả năng tránh vật cản và dẫn đường an toàn trên mọi địa hình khuôn viên.
            </p>
          </div>

          {/* Status */}
          <div className="mt-auto pt-4 border-t border-gray-100/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full bg-emerald-400"
                style={{ boxShadow: '0 0 6px rgba(52,211,153,0.7)' }}
                aria-hidden="true"
              />
              <span className="text-[11.5px] text-gray-400 font-medium">Online · 24/7</span>
            </div>
            <svg width="15" height="15" fill="none" stroke="#9ca3af" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </article>

        {/* ── Card 2: Đặt lịch — featured (2 cols) ── */}
        <article
          id="card-booking"
          className="glass-featured card-lift rounded-[2rem] p-8 flex flex-col gap-5"
        >
          {/* Top row */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="feature-tag mb-3 block" style={{ width: 'fit-content' }}>
                TÍNH NĂNG MỚI
              </span>
              <h3 className="text-[22px] md:text-[26px] font-bold text-[#0d0d0d] leading-tight tracking-tight">
                Đặt lịch tham quan<br />trực tuyến
              </h3>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="4" width="18" height="17" rx="4" stroke="#0d0d0d" strokeWidth="1.7" />
                <path d="M3 9h18" stroke="#0d0d0d" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M8 2v4M16 2v4" stroke="#0d0d0d" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M7 13h3M7 16.5h6" stroke="#6b7280" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          {/* Description */}
          <p className="text-[14px] text-gray-500 leading-relaxed max-w-[420px]">
            Chọn ngày, giờ và lộ trình yêu thích từ điện thoại của bạn chỉ trong 30 giây.
            Hệ thống tự động xác nhận và gửi QR check-in về email.
          </p>

          {/* 3-step mini flow */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { emoji: '📅', label: 'Chọn lịch' },
              { emoji: '🤖', label: 'Gặp robot' },
              { emoji: '🎉', label: 'Tham quan' },
            ].map(({ emoji, label }) => (
              <div
                key={label}
                className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100/80"
              >
                <div className="text-[22px] mb-1">{emoji}</div>
                <div className="text-[11px] font-semibold text-gray-600">{label}</div>
              </div>
            ))}
          </div>

          {/* Bottom row */}
          <div className="mt-auto pt-4 border-t border-gray-100/70 flex items-center justify-between">
            <div>
              <div className="text-[12px] text-gray-400 font-medium">Thời gian trung bình</div>
              <div className="text-[15px] font-bold text-[#0d0d0d]">45 – 90 phút / tour</div>
            </div>
            <button
              className="circle-arrow"
              aria-label="Đặt lịch ngay"
              id="booking-arrow-btn"
              type="button"
            >
              <svg width="20" height="20" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M7 7h10v10" />
              </svg>
            </button>
          </div>
        </article>

        {/* ── Card 3: Đội ngũ hỗ trợ ── */}
        <article
          id="card-support"
          className="glass card-lift rounded-[2rem] p-7 flex flex-col gap-5"
        >
          {/* Icon */}
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center flex-shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#374151" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="9" cy="7" r="4" stroke="#374151" strokeWidth="1.7" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="#374151" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>

          <div className="flex flex-col gap-2 flex-1">
            <h3 className="text-[17px] font-bold text-[#0d0d0d] leading-tight tracking-tight">
              Đội ngũ<br />hỗ trợ
            </h3>
            <p className="text-[13px] text-gray-500 leading-relaxed">
              Chuyên viên luôn sẵn sàng giải đáp mọi thắc mắc trong suốt hành trình của bạn.
            </p>
          </div>

          {/* Avatars + status */}
          <div className="mt-auto pt-4 border-t border-gray-100/70">
            <div className="flex items-center gap-0 mb-3">
              {[
                { label: 'A', bg: 'linear-gradient(135deg,#374151,#111)' },
                { label: 'B', bg: 'linear-gradient(135deg,#6b7280,#374151)' },
                { label: 'C', bg: 'linear-gradient(135deg,#9ca3af,#6b7280)' },
                { label: '+5', bg: '#f3f4f6', color: '#6b7280' },
              ].map(({ label, bg, color }) => (
                <div
                  key={label}
                  className="avatar-item"
                  style={{ background: bg, color: color ?? '#fff' }}
                  aria-label={`Thành viên ${label}`}
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"
                style={{ boxShadow: '0 0 5px rgba(52,211,153,0.7)' }}
                aria-hidden="true"
              />
              <span className="text-[12px] text-gray-400 font-medium">
                8 chuyên viên đang trực tuyến
              </span>
            </div>
          </div>
        </article>

      </div>
    </section>
  )
}

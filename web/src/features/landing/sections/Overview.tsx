/**
 * Offset portrait media against the project statement. The digital twin render
 * is the strongest asset in the set, so it gets a full column at its native
 * 4:5 proportion instead of being cropped into a banner.
 */
export function Overview() {
  return (
    <section className="lp-sec lp-ctn" id="gioi-thieu">
      <div className="lp-ov__grid">
        <figure className="lp-ov__media" id="overview-media" data-reveal>
          <img
            src="/images/digital-twin.jpg"
            alt="Bản sao kỹ thuật số của khuôn viên đại học với vị trí robot theo thời gian thực"
            loading="lazy"
            decoding="async"
          />
        </figure>

        <div>
          <h2 className="lp-h2 lp-h2--wide" data-reveal>
            Một chuyến tham quan tự động và quan sát được từ đầu đến cuối.
          </h2>
          <p className="lp-body" data-reveal style={{ marginTop: 24 }}>
            Khách chọn lộ trình trên web app, robot nhận lệnh và dẫn đường, trợ lý AI thuyết minh dọc tuyến.
            Cùng lúc, đội vận hành nhìn thấy mọi robot trên bản sao kỹ thuật số của khuôn viên.
          </p>

          <dl className="lp-facts" data-reveal>
            <div className="lp-fact">
              <dt className="lp-fact__k">Tự hành</dt>
              <dd className="lp-fact__v">ROS 2, LiDAR và camera RGB-D cho điều hướng an toàn giữa người đi bộ.</dd>
            </div>
            <div className="lp-fact">
              <dt className="lp-fact__k">Đa ngôn ngữ</dt>
              <dd className="lp-fact__v">Thuyết minh và hỏi đáp bằng giọng nói, chuyển ngôn ngữ ngay trong tour.</dd>
            </div>
            <div className="lp-fact">
              <dt className="lp-fact__k">Quan sát được</dt>
              <dd className="lp-fact__v">Vị trí, pin và sự cố của từng robot hiển thị trực tiếp cho đội vận hành.</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}

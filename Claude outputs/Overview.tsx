/**
 * Digital Twin, in its own section rather than as an introduction.
 *
 * By the time a reader gets here they already know what a tour looks like, so
 * this one answers the operator's question: while the robots are out, what can
 * we actually see. The render is the strongest asset in the set, so it keeps
 * its native 4:5 proportion instead of being cropped into a banner.
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
            Mọi chuyến đang chạy, trên cùng một bản đồ.
          </h2>
          <p className="lp-body" data-reveal>
            Bản sao kỹ thuật số của khuôn viên bám theo từng robot trong lúc tour diễn ra.
            Đội vận hành thấy chuyến nào đang ở đâu, robot nào sắp hết pin và điểm nào đang
            có sự cố, mà không cần gọi ra hiện trường.
          </p>

          <dl className="lp-facts" data-reveal>
            <div className="lp-fact">
              <dt className="lp-fact__k">Vị trí</dt>
              <dd className="lp-fact__v">Từng robot hiện trên bản đồ 3D theo đúng lộ trình đang chạy.</dd>
            </div>
            <div className="lp-fact">
              <dt className="lp-fact__k">Tình trạng</dt>
              <dd className="lp-fact__v">Pin, tốc độ và kết nối được cập nhật liên tục trong suốt chuyến.</dd>
            </div>
            <div className="lp-fact">
              <dt className="lp-fact__k">Sự cố</dt>
              <dd className="lp-fact__v">Cảnh báo hiện ngay khi xảy ra, kèm vị trí và chuyến đang liên quan.</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}

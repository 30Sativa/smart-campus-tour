import { useMemo, useState } from 'react'
import { ArrowUpRight, CalendarDays, ClipboardList, MailCheck, Search, SlidersHorizontal } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import type { RepresentativeTour } from '../../api/contracts/representative'
import { EmptyState, ErrorState, RepPage, Skeleton } from '../../features/representative/components/RepUi'
import { TourCard } from '../../features/representative/components/TourCard'
import { useRepRegistrations, useRepTours } from '../../features/representative/representative-hooks'
import { readRepError } from '../../features/representative/rep-format'

type Filter = 'tat-ca' | 'dang-nhan' | 'sap-dien-ra'
const FILTERS: Array<{ value: Filter; label: string; test: (tour: RepresentativeTour) => boolean }> = [
  { value: 'tat-ca', label: 'Tất cả buổi', test: () => true },
  { value: 'dang-nhan', label: 'Còn nhận đăng ký', test: (tour) => tour.register.allowed },
  { value: 'sap-dien-ra', label: 'Sắp diễn ra', test: (tour) => ['Scheduled', 'Ready', 'Running'].includes(tour.state) },
]

/** Available Tours follows the reference layout while actions remain state gated. */
export default function RepToursPage() {
  const tours = useRepTours()
  const registrations = useRepRegistrations()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [sortByDate, setSortByDate] = useState(false)
  const filter = (FILTERS.some((item) => item.value === params.get('loc')) ? params.get('loc') : 'tat-ca') as Filter
  const all = useMemo(() => tours.data ?? [], [tours.data])
  const rows = useMemo(() => all
    .filter(FILTERS.find((item) => item.value === filter)!.test)
    .filter((tour) => `${tour.name} ${tour.routeName} ${tour.stops.join(' ')}`.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi')))
    .sort((a, b) => {
      if (!sortByDate) {
        const priority = (tour: RepresentativeTour) => tour.register.allowed ? 0 : tour.state === 'Scheduled' ? 1 : tour.state === 'Ready' ? 2 : tour.state === 'Running' ? 3 : 4
        const order = priority(a) - priority(b)
        if (order) return order
      }
      return a.scheduledAt.localeCompare(b.scheduledAt)
    }), [all, filter, query, sortByDate])
  const myRegistrations = registrations.data ?? []

  return (
    <RepPage>
      <header className="rep-catalog-heading">
        <div>
          <span className="rep-kicker"><span />HỆ THỐNG ĐIỀU PHỐI THAM QUAN</span>
          <h1>Các buổi tham quan khả dụng<span>.</span></h1>
          <p>Chọn buổi còn nhận đăng ký để chuẩn bị thông tin đoàn và danh sách tham gia.</p>
        </div>
        <div className="rep-heading-actions">
          <a href="#quy-trinh-dang-ky" className="rep-outline-action">Xem quy trình</a>
          <button type="button" className="rep-solid-action" onClick={() => { setParams({ loc: 'dang-nhan' }); document.getElementById('rep-tour-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
            Buổi nhận đăng ký <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="rep-catalog-metrics" aria-label="Tổng quan buổi tham quan">
        <div className="rep-catalog-metric"><span>Buổi sắp diễn ra</span><strong>{all.filter(FILTERS[2].test).length.toString().padStart(2, '0')}</strong><small>{all.filter(FILTERS[1].test).length} buổi còn nhận đăng ký</small><CalendarDays size={20} aria-hidden="true" /></div>
        <Link to="/dai-dien/dang-ky" className="rep-catalog-metric"><span>Đoàn của trường bạn</span><strong>{myRegistrations.length.toString().padStart(2, '0')}</strong><small>Xem các đăng ký</small><ClipboardList size={20} aria-hidden="true" /></Link>
        <Link to="/dai-dien/dang-ky?trang-thai=da-duyet" className="rep-catalog-metric"><span>Đăng ký đã duyệt</span><strong>{myRegistrations.filter((item) => item.state === 'Approved').length.toString().padStart(2, '0')}</strong><small>Xem thông tin tham gia</small><MailCheck size={20} aria-hidden="true" /></Link>
      </section>

      <section className="rep-tour-board" id="rep-tour-results" aria-label="Danh sách buổi tham quan">
        <div className="rep-tour-toolbar">
          <div className="rep-tour-filters" role="group" aria-label="Lọc buổi tham quan">
            {FILTERS.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setParams(item.value === 'tat-ca' ? {} : { loc: item.value }, { replace: true })}>
              {item.label}<span>{tours.data ? all.filter(item.test).length : '–'}</span>
            </button>)}
          </div>
          <div className="rep-tour-tools">
            <label className="rep-tour-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Tìm buổi theo tên hoặc lộ trình</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tour, điểm tham quan..." /></label>
            <button type="button" className="rep-tour-sort" onClick={() => setSortByDate((value) => !value)} aria-label={`Sắp xếp: ${sortByDate ? 'ngày sớm nhất' : 'ưu tiên buổi mở'}`}><SlidersHorizontal size={15} aria-hidden="true" />{sortByDate ? 'Sớm nhất' : 'Ưu tiên đăng ký'}</button>
          </div>
        </div>
        {tours.isLoading ? <div className="rep-tour-grid" aria-busy="true" aria-label="Đang tải buổi tham quan">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[420px] w-full rounded-2xl" />)}</div>
          : tours.isError ? <ErrorState title="Không tải được danh sách buổi" message={readRepError(tours.error).message} onRetry={() => void tours.refetch()} />
          : rows.length === 0 ? <EmptyState icon={CalendarDays} title={query ? 'Không tìm thấy buổi phù hợp' : 'Chưa có buổi ở bộ lọc này'} description="Thử từ khóa khác hoặc xem tất cả buổi tham quan." action={<button type="button" className="rep-outline-action" onClick={() => { setQuery(''); setParams({}) }}>Xem tất cả buổi</button>} />
          : <div className="rep-tour-grid">{rows.map((tour, index) => <TourCard key={tour.id} tour={tour} visualIndex={index} />)}</div>}
      </section>

      <section className="rep-steps" id="quy-trinh-dang-ky" aria-labelledby="rep-steps-title">
        <div className="rep-steps-heading"><div><h2 id="rep-steps-title">Quy trình 4 bước đăng ký tham quan</h2><p>Thực hiện theo thứ tự để đoàn nhận thông tin tham gia đúng buổi.</p></div><Link to="/dai-dien/dang-ky">Đăng ký của tôi <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
        <ol className="rep-steps-grid">
          <li><span>1</span><div><strong>Chọn buổi tour</strong><p>Chọn buổi SCHEDULED phù hợp với lịch và nội dung đoàn.</p></div></li>
          <li><span>2</span><div><strong>Chuẩn bị danh sách</strong><p>Nhập thông tin đoàn, tải Excel và xem lỗi trước khi gửi.</p></div></li>
          <li><span>3</span><div><strong>Admin phê duyệt</strong><p>Theo dõi trạng thái và lý do từ chối trong đăng ký của bạn.</p></div></li>
          <li><span>4</span><div><strong>Nhận thông tin</strong><p>Sau duyệt, mở đăng ký để xem thông tin tham gia.</p></div></li>
        </ol>
      </section>
    </RepPage>
  )
}

import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { ArrowRight, ArrowUpRight, Bot, CalendarDays, MapPin, Search, Sparkles, X } from 'lucide-react';
import { routesApi } from '../../api/routes-api';
import { VisitorLayout } from '../../components/visitor/VisitorLayout';
import { TourCard } from '../../components/visitor/TourCard';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLocaleLowerCase('vi').trim();

export default function ToursPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('q') || '';
  const duration = params.get('duration') || 'all';
  const { data: routes = [], isPending, isError, refetch } = useQuery({
    queryKey: ['visitor-tour-routes'],
    queryFn: routesApi.getRoutes,
  });
  const updateFilter = (key: string, value: string) => {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value && value !== 'all') next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  };
  const filteredRoutes = routes.filter(route => {
    const matchesText = normalize([route.name, route.description, ...route.waypoints.map(w => w.poi?.name || w.label)].join(' ')).includes(normalize(search));
    return matchesText && (duration === 'all' || (duration === 'short' ? route.estimatedMinutes <= 30 : route.estimatedMinutes > 30));
  });
  const hasFilters = Boolean(search || duration !== 'all');

  return (
    <VisitorLayout>
      <div className="mx-auto max-w-[1320px] px-5 pb-16 pt-6 lg:px-10 lg:pt-8">
        <section aria-labelledby="explore-title" className="relative isolate overflow-hidden rounded-[28px] bg-[#10232b]">
          <img src="/images/hero-campus.jpg" alt="" fetchPriority="high" className="absolute inset-0 -z-20 h-full w-full object-cover object-[65%_center]" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#071014]/95 via-[#071014]/75 to-[#071014]/15" />
          <div className="max-w-[690px] px-6 py-12 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
            <div className="mb-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300"><MapPin size={14} />Khám phá khuôn viên</div>
            <h1 id="explore-title" className="max-w-[570px] text-4xl font-semibold leading-[1.12] tracking-[-0.045em] text-white sm:text-5xl lg:text-[52px]">Một campus.<br /><span className="text-cyan-300">Muôn điều khám phá.</span></h1>
            <p className="mt-5 max-w-[430px] text-sm leading-relaxed !text-slate-200 sm:text-base">Chọn hành trình phù hợp với bạn. Khám phá FPT University cùng robot AMR và trợ lý AI.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#tour-catalog" className="inline-flex min-h-12 items-center gap-6 rounded-full bg-cyan-300 px-6 text-sm font-bold !text-[#071014] transition-colors hover:bg-cyan-200">Khám phá các tour <ArrowUpRight size={18} /></a>
              <Link to="/my-bookings" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/30 bg-[#071014]/30 px-5 text-sm font-semibold !text-white hover:bg-[#071014]/60"><CalendarDays size={17} />Tour của tôi</Link>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 divide-y divide-[var(--border-color)] border-b border-[var(--border-color)] py-2 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { icon: MapPin, title: 'Chọn tuyến yêu thích', text: 'Xem điểm dừng và thời lượng' },
            { icon: CalendarDays, title: 'Đặt lịch phù hợp', text: 'Chọn ngày và khung giờ còn chỗ' },
            { icon: Bot, title: 'Khám phá cùng AMR', text: 'Theo dõi tour trong Tour của tôi' },
          ].map(({ icon: Icon, title, text }) => <div key={title} className="flex items-center gap-3 px-3 py-5 lg:px-6"><Icon size={22} className="shrink-0 text-[var(--accent)]" /><div><div className="text-sm font-semibold">{title}</div><p className="mt-1 text-xs text-[var(--text-secondary)]">{text}</p></div></div>)}
        </div>

        <section id="tour-catalog" aria-labelledby="catalog-title" className="scroll-mt-24 pt-12">
          <div className="mb-6 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div><div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Hành trình của bạn</div><h2 id="catalog-title" className="text-3xl font-semibold tracking-tight">Bạn muốn khám phá điều gì?</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">Tìm một góc nhìn mới, bắt đầu từ chuyến đi này.</p></div>
            <div className="relative w-full lg:w-[320px]">
              <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
              <input type="search" aria-label="Tìm tour hoặc điểm tham quan" placeholder="Tìm tour, điểm tham quan..." value={search} onChange={event => updateFilter('q', event.target.value)} className="min-h-12 w-full rounded-full border border-[var(--border-color)] bg-[var(--bg-secondary)] pl-11 pr-4 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20" />
            </div>
          </div>
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <div aria-label="Lọc theo thời lượng" className="flex flex-wrap gap-2">
              {[['all', 'Tất cả hành trình'], ['short', 'Tối đa 30 phút'], ['long', 'Trên 30 phút']].map(([value, label]) => <button key={value} type="button" aria-pressed={duration === value} onClick={() => updateFilter('duration', value)} className={`min-h-10 rounded-full border px-4 text-xs font-semibold transition-colors ${duration === value ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)]'}`}>{label}</button>)}
            </div>
            {!isPending && !isError && <span role="status" className="text-xs text-[var(--text-secondary)]">{filteredRoutes.length} hành trình{hasFilters ? ' phù hợp' : ' để khám phá'}</span>}
          </div>
          {isPending && <div role="status" aria-label="Đang tải danh sách lộ trình" className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map(i => <div key={i} className="h-[390px] animate-pulse rounded-[24px] bg-[var(--bg-secondary)] motion-reduce:animate-none" />)}</div>}
          {isError && <div role="alert" className="rounded-[24px] border border-[var(--border-color)] bg-[var(--bg-secondary)] p-10 text-center"><p>Không thể tải danh sách lộ trình. Vui lòng thử lại.</p><button type="button" onClick={() => void refetch()} className="mt-4 rounded-full border border-[var(--border-color)] px-5 py-2 text-sm font-semibold">Thử lại</button></div>}
          {!isPending && !isError && routes.length === 0 && <div className="rounded-[24px] border border-[var(--border-color)] py-16 text-center text-sm text-[var(--text-secondary)]">Chưa có tour mở đăng ký. Vui lòng quay lại sau.</div>}
          {!isPending && !isError && routes.length > 0 && filteredRoutes.length === 0 && <div className="rounded-[24px] border border-[var(--border-color)] py-16 text-center"><p>Không tìm thấy hành trình phù hợp.</p><button type="button" onClick={() => setParams({}, { replace: true })} className="mx-auto mt-4 flex items-center gap-2 rounded-full border border-[var(--border-color)] px-5 py-2 text-sm"><X size={14} />Xóa bộ lọc</button></div>}
          {!isPending && !isError && <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{filteredRoutes.map(route => <TourCard key={route.id} name={route.name} image={route.thumbnailUrl || '/images/hero-campus.jpg'} duration={`${route.estimatedMinutes} phút`} poiCount={route.waypoints.filter(w => w.poi).length} description={route.description} linkTo={`/tours/${route.id}`} />)}</div>}
        </section>

        <aside className="mt-10 flex flex-col gap-6 rounded-[24px] border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]"><Sparkles size={23} /></span><div><h2 className="text-lg font-semibold">Thêm câu chuyện ở mỗi điểm dừng.</h2><p className="mt-1 max-w-[540px] text-sm text-[var(--text-secondary)]">Mở AI Guide để tìm hiểu trải nghiệm hỏi đáp và thuyết minh trong chuyến tham quan.</p></div></div>
          <Link to="/ai-guide" className="inline-flex shrink-0 items-center justify-center gap-5 rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] px-5 py-3 text-sm font-semibold hover:border-[var(--accent)]">Khám phá AI Guide <ArrowRight size={17} /></Link>
        </aside>
      </div>
    </VisitorLayout>
  );
}


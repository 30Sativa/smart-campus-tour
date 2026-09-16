import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Clock3, MapPin, CalendarDays } from 'lucide-react';
import { routesApi } from '../../api/routes-api';
import { VisitorLayout } from '../../components/visitor/VisitorLayout';
import { PrimaryCTA } from '../../components/visitor/PrimaryCTA';

export default function RouteDetail() {
  const { id } = useParams();
  const { data: route, isPending, isError, refetch } = useQuery({
    queryKey: ['visitor-tour-route', id],
    queryFn: () => routesApi.getRouteById(id!),
  });
  if (isPending) return <VisitorLayout><div role="status" aria-label="Đang tải chi tiết lộ trình" className="mx-auto my-8 h-[500px] max-w-[1240px] animate-pulse rounded-[28px] bg-[var(--bg-secondary)] motion-reduce:animate-none" /></VisitorLayout>;
  if (isError || !route) return <VisitorLayout><div role="alert" className="px-6 py-20 text-center"><p>Không tìm thấy thông tin lộ trình.</p><button onClick={() => void refetch()} className="mt-5 rounded-full border border-[var(--border-color)] px-5 py-3">Thử lại</button><Link to="/tours" className="ml-5 underline">Về danh sách tour</Link></div></VisitorLayout>;
  const waypoints = [...route.waypoints].sort((a, b) => a.order - b.order);
  return (
    <VisitorLayout>
      <div className="mx-auto max-w-[1320px] px-5 py-8 lg:px-10">
        <Link to="/tours" className="mb-6 inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ArrowLeft size={16} />Tất cả hành trình</Link>
        <section className="grid overflow-hidden rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-secondary)] md:grid-cols-2">
          <img src={route.thumbnailUrl || '/images/hero-campus.jpg'} alt={route.name} className="h-full min-h-64 max-h-[480px] w-full object-cover" />
          <div className="flex flex-col justify-center p-6 lg:p-10">
            <div className="mb-5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Khám phá cùng CampusTour</div>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">{route.name}</h1>
            <p className="mt-5 text-sm leading-relaxed text-[var(--text-secondary)]">{route.description}</p>
            <div className="mt-6 flex flex-wrap gap-5 text-sm text-[var(--text-secondary)]"><span className="flex items-center gap-2"><Clock3 size={16} />{route.estimatedMinutes} phút</span><span className="flex items-center gap-2"><MapPin size={16} />{waypoints.filter(w => w.poi).length} điểm tham quan</span></div>
            <PrimaryCTA to={`/tours/${route.id}/book`} className="mt-8 self-start">Chọn ngày & giờ <ArrowRight size={17} /></PrimaryCTA>
          </div>
        </section>
        <div className="grid gap-10 py-12 lg:grid-cols-[1fr_340px] lg:gap-20">
          <section aria-labelledby="itinerary-title">
            <h2 id="itinerary-title" className="mb-2 text-2xl font-semibold tracking-tight">Hành trình tham quan</h2>
            <p className="mb-8 text-sm text-[var(--text-secondary)]">Những điểm dừng trên tuyến đường của bạn.</p>
            <ol>
              {waypoints.map((wp, i) => <li key={wp.id} className="relative flex gap-5 pb-8 last:pb-0">
                {i < waypoints.length - 1 && <div aria-hidden="true" className="absolute bottom-0 left-[19px] top-10 w-px bg-[var(--border-color)]" />}
                <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs font-bold text-[var(--accent)]">{i + 1}</span>
                <div className="pt-2"><h3 className="font-semibold">{wp.label}</h3>{wp.poi && <><div className="mt-1 text-xs font-medium text-[var(--accent)]">{wp.poi.name}</div><p className="mt-2 max-w-[560px] text-sm leading-relaxed text-[var(--text-secondary)]">{wp.poi.description}</p></>}</div>
              </li>)}
            </ol>
            {!waypoints.length && <p>Hành trình chưa có điểm dừng chi tiết.</p>}
          </section>
          <aside><div className="sticky top-28 rounded-[24px] border border-[var(--border-color)] bg-[var(--bg-secondary)] p-7"><CalendarDays size={24} className="mb-4 text-[var(--accent)]" /><h2 className="text-xl font-semibold">Sẵn sàng cho chuyến đi?</h2><p className="mb-6 mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">Chọn ngày và khung giờ còn chỗ, kiểm tra thông tin rồi xác nhận đặt tour.</p><PrimaryCTA to={`/tours/${route.id}/book`} className="w-full">Đặt tour này <ArrowRight size={17} /></PrimaryCTA></div></aside>
        </div>
      </div>
    </VisitorLayout>
  );
}

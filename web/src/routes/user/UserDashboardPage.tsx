import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Bell,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Heart,
  MapPin,
  QrCode,
  Sparkles,
} from 'lucide-react';
import { bookingsApi, type BookingResponse } from '../../api/bookings-api';
import { useAuthStore } from '../../stores/auth-store';
import { GlassCard } from '../../components/visitor/GlassCard';
import { PrimaryCTA } from '../../components/visitor/PrimaryCTA';
import { QuickActionCard } from '../../components/visitor/QuickActionCard';
import { StatCard } from '../../components/visitor/StatCard';
import { VisitorLayout } from '../../components/visitor/VisitorLayout';
import {
  mockFavoritePlaces,
  mockNotifications,
  mockQuickActions,
  mockRecommendedPlaces,
  mockUserStats,
} from '../../data/user-dashboard-mock';

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function isUpcoming(booking: BookingResponse) {
  return new Date(booking.startTime) > new Date() && booking.status !== 'Cancelled' && booking.status !== 'Completed';
}

export default function UserDashboardPage() {
  const user = useAuthStore((state) => state.user);
  const { data: bookings = [] } = useQuery({
    queryKey: ['visitor-my-bookings'],
    queryFn: bookingsApi.getMyBookings,
  });

  const upcomingBookings = useMemo(
    () => bookings.filter(isUpcoming).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).slice(0, 2),
    [bookings],
  );
  const firstName = user?.username?.trim() || 'bạn';

  return (
    <VisitorLayout>
      <div className="relative overflow-hidden bg-[#071014]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.025)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="pointer-events-none absolute -top-40 right-[-10rem] h-[32rem] w-[32rem] rounded-full bg-cyan-400/10 blur-[130px]" />
        <div className="pointer-events-none absolute top-[45rem] -left-40 h-[28rem] w-[28rem] rounded-full bg-emerald-400/10 blur-[130px]" />

        <div className="relative mx-auto max-w-[1300px] px-4 py-8 pb-24 sm:px-6 md:py-12 lg:px-10 lg:py-16">
          <section className="relative min-h-[475px] overflow-hidden rounded-[32px] border border-white/10 bg-[#0b151a] shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
            <img
              src="/images/hero-campus.jpg"
              alt="Khuôn viên CampusTour"
              className="absolute inset-0 h-full w-full object-cover opacity-45"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,16,20,0.98)_0%,rgba(7,16,20,0.84)_45%,rgba(7,16,20,0.3)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(7,16,20,0.5)_0%,transparent_40%)]" />

            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex min-h-[475px] max-w-2xl flex-col justify-end p-7 sm:p-10 lg:p-14"
            >
              <span className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-bold tracking-[0.16em] text-cyan-200 uppercase backdrop-blur-md">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
                CAMPUS TOUR PERSONAL
              </span>
              <h1 className="max-w-xl text-4xl leading-[1.03] font-bold tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">
                Xin chào, {firstName} <span className="inline-block animate-[floatMini_4s_ease-in-out_infinite]">👋</span>
              </h1>
              <p className="mt-5 max-w-lg text-sm leading-7 text-white/65 sm:text-base">
                Sẵn sàng khám phá khuôn viên cùng Astra? Robot hướng dẫn và hành trình của bạn đang chờ ở phía trước.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <PrimaryCTA to="/tours" icon={<ArrowRight size={14} className="text-white" aria-hidden="true" />}>
                  Đặt tour mới
                </PrimaryCTA>
                <Link
                  to="/my-bookings"
                  className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-bold text-white backdrop-blur-md transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#071014]"
                >
                  Tour của tôi
                </Link>
              </div>
            </motion.div>

            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0, x: 36 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="absolute right-6 bottom-6 hidden items-center gap-3 rounded-2xl border border-white/15 bg-[#071014]/65 px-4 py-3 backdrop-blur-xl md:flex"
            >
              <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 text-[#071014] shadow-[0_0_28px_rgba(34,211,238,0.35)]">
                <Bot size={21} strokeWidth={2} />
              </span>
              <span>
                <span className="block text-xs font-bold text-white">Astra sẵn sàng</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Trực tuyến</span>
              </span>
            </motion.div>
          </section>

          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Tổng quan hành trình">
            <StatCard label="Tour sắp tới" value={upcomingBookings.length || mockUserStats.upcomingTours} icon="calendar" trend={{ value: 12, positive: true }} />
            <StatCard label="Địa điểm yêu thích" value={mockUserStats.favoritePlaces} icon="heart" />
            <StatCard label="Tour hoàn thành" value={mockUserStats.completedTours} icon="map" trend={{ value: 25, positive: true }} />
            <StatCard label="Thông báo mới" value={mockNotifications.filter((item) => !item.read).length} icon="bell" />
          </section>

          <section className="mt-16" aria-labelledby="quick-actions-title">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold tracking-[0.18em] text-[var(--accent)] uppercase">Bắt đầu nhanh</p>
                <h2 id="quick-actions-title" className="mt-2 text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">Truy cập nhanh</h2>
              </div>
              <p className="max-w-xs text-sm leading-6 text-white/50">Mọi thứ bạn cần để chuẩn bị và tận hưởng chuyến tham quan.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {mockQuickActions.map((action) => <QuickActionCard key={action.id} action={action} />)}
            </div>
          </section>

          <section className="mt-20 grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
            <div>
              <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.18em] text-[var(--accent)] uppercase">Hành trình của bạn</p>
                  <h2 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">Tour sắp diễn ra</h2>
                </div>
                <Link to="/my-bookings" className="inline-flex items-center gap-1.5 text-sm font-bold text-cyan-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                  Xem tất cả <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>

              <div className="space-y-4">
                {upcomingBookings.length > 0 ? upcomingBookings.map((booking, index) => (
                  <motion.div key={booking.id} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }}>
                    <GlassCard hoverEffect className="p-5 sm:p-6">
                      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                            <CalendarDays size={23} aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="text-[10px] font-bold tracking-[0.13em] text-emerald-300 uppercase">Đã xác nhận</span>
                              <span className="text-xs text-white/40">{dateLabel(booking.startTime)}</span>
                            </div>
                            <h3 className="truncate text-lg font-bold tracking-tight text-white">{booking.routeName}</h3>
                            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/55">
                              <span className="inline-flex items-center gap-1"><Clock3 size={13} aria-hidden="true" />{timeLabel(booking.startTime)} – {timeLabel(booking.endTime)}</span>
                              <span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden="true" />Cổng chính</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Link to={`/check-in/${booking.id}`} className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2.5 text-xs font-bold text-cyan-200 transition hover:bg-cyan-300 hover:text-[#071014] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                            <QrCode size={15} aria-hidden="true" /> Check-in
                          </Link>
                        </div>
                      </div>
                    </GlassCard>
                  </motion.div>
                )) : (
                  <GlassCard className="p-7 sm:p-8">
                    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-white/45"><CalendarDays size={21} aria-hidden="true" /></span>
                        <div><h3 className="font-bold text-white">Bạn chưa có tour sắp diễn ra</h3><p className="mt-1 text-sm text-white/50">Chọn hành trình phù hợp để bắt đầu khám phá campus.</p></div>
                      </div>
                      <PrimaryCTA to="/tours">Khám phá tour</PrimaryCTA>
                    </div>
                  </GlassCard>
                )}
              </div>
            </div>

            <GlassCard className="p-6 sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.18em] text-[var(--accent)] uppercase">Cập nhật mới</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">Thông báo</h2>
                </div>
                <Link to="/notifications" aria-label="Xem tất cả thông báo" className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/60 transition hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"><Bell size={17} aria-hidden="true" /></Link>
              </div>
              <div className="mt-5 space-y-1">
                {mockNotifications.slice(0, 3).map((notification) => (
                  <Link key={notification.id} to="/notifications" className="block rounded-2xl px-3 py-3 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                    <div className="flex gap-3">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read ? 'bg-white/25' : 'bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.8)]'}`} />
                      <span>
                        <span className="block text-sm font-bold text-white">{notification.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-white/50">{notification.message}</span>
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </GlassCard>
          </section>

          <section className="mt-20 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
            <GlassCard className="relative min-h-[395px] overflow-hidden p-0">
              <img src="/images/digital-twin.jpg" alt="Bản đồ khuôn viên số" className="absolute inset-0 h-full w-full object-cover opacity-35" />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,16,20,.96)_0%,rgba(7,16,20,.72)_54%,rgba(7,16,20,.38)_100%)]" />
              <div className="relative flex min-h-[395px] max-w-lg flex-col justify-end p-7 sm:p-9">
                <span className="mb-auto inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-[10px] font-bold tracking-[0.14em] text-emerald-200 uppercase"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />Trực tuyến</span>
                <p className="text-[10px] font-bold tracking-[0.18em] text-cyan-200 uppercase">Digital Campus</p>
                <h2 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-white">Bản đồ khuôn viên trực tuyến</h2>
                <p className="mt-3 text-sm leading-6 text-white/65">Tìm địa điểm, xem lộ trình và theo dõi vị trí robot trong hành trình của bạn.</p>
                <Link to="/map" className="mt-6 inline-flex w-fit items-center gap-2 text-sm font-bold text-cyan-200 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Mở bản đồ <ArrowRight size={16} aria-hidden="true" /></Link>
              </div>
            </GlassCard>

            <GlassCard className="relative overflow-hidden p-7 sm:p-8">
              <div className="absolute -right-20 -bottom-20 h-56 w-56 rounded-full bg-gradient-to-tl from-cyan-400/15 to-emerald-400/5 blur-2xl" />
              <div className="relative flex h-full flex-col">
                <span className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><Sparkles size={22} aria-hidden="true" /></span>
                <p className="mt-6 text-[10px] font-bold tracking-[0.18em] text-[var(--accent)] uppercase">AI Assistant</p>
                <h2 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-white">Hỏi Astra bất cứ điều gì</h2>
                <p className="mt-3 text-sm leading-6 text-white/60">Tìm đường đến thư viện, hỏi về tour hoặc nhận gợi ý khám phá phù hợp.</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {['Thư viện ở đâu?', 'Có tour tiếng Anh không?'].map((question) => <span key={question} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/60">{question}</span>)}
                </div>
                <Link to="/ai-guide" className="mt-auto pt-7 inline-flex items-center gap-2 text-sm font-bold text-cyan-200 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Trò chuyện với Astra <ArrowRight size={16} aria-hidden="true" /></Link>
              </div>
            </GlassCard>
          </section>

          <section className="mt-20" aria-labelledby="recommendations-title">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div><p className="text-[10px] font-bold tracking-[0.18em] text-[var(--accent)] uppercase">Dữ liệu minh hoạ</p><h2 id="recommendations-title" className="mt-2 text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">Đề xuất cho bạn</h2></div>
              <Link to="/favorites" className="inline-flex items-center gap-1.5 text-sm font-bold text-cyan-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Điểm yêu thích <Heart size={15} aria-hidden="true" /></Link>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {mockRecommendedPlaces.map((place, index) => (
                <motion.div key={place.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }}>
                  <GlassCard hoverEffect variant="light" className="group h-full">
                    <div className="relative aspect-[16/10] overflow-hidden"><img src={place.imageUrl} alt={place.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-[#071014] via-transparent to-transparent" /><span className="absolute top-3 left-3 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[10px] font-bold text-cyan-100 backdrop-blur-md">{place.reason}</span></div>
                    <div className="p-5"><h3 className="text-lg font-bold tracking-tight text-white">{place.name}</h3><p className="mt-2 text-sm leading-6 text-white/55">{place.description}</p><Link to="/map" className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-cyan-300 transition hover:text-white">Xem trên bản đồ <ArrowRight size={14} aria-hidden="true" /></Link></div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          </section>

          <section className="mt-20 grid gap-4 sm:grid-cols-2" aria-label="Thông tin cá nhân và điểm yêu thích">
            <GlassCard className="p-6">
              <div className="flex items-start gap-4"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-400/10 text-rose-300"><Heart size={20} aria-hidden="true" /></span><div><p className="text-[10px] font-bold tracking-[0.16em] text-white/45 uppercase">Đã lưu</p><h2 className="mt-1 text-xl font-bold text-white">{mockFavoritePlaces.length} địa điểm yêu thích</h2><p className="mt-2 text-sm text-white/55">Lưu lại những điểm bạn muốn ghé thăm trong lần tiếp theo.</p><Link to="/favorites" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-cyan-300 transition hover:text-white">Xem danh sách <ArrowRight size={15} aria-hidden="true" /></Link></div></div>
            </GlassCard>
            <GlassCard className="p-6">
              <div className="flex items-start gap-4"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-300"><CheckCircle2 size={20} aria-hidden="true" /></span><div><p className="text-[10px] font-bold tracking-[0.16em] text-white/45 uppercase">Hồ sơ</p><h2 className="mt-1 text-xl font-bold text-white">Cá nhân hoá hành trình</h2><p className="mt-2 text-sm text-white/55">Cập nhật ngôn ngữ và tuỳ chọn nhận thông báo của bạn.</p><Link to="/profile" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-cyan-300 transition hover:text-white">Quản lý hồ sơ <ArrowRight size={15} aria-hidden="true" /></Link></div></div>
            </GlassCard>
          </section>
        </div>
      </div>
    </VisitorLayout>
  );
}

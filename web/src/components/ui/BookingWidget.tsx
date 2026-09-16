import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createStore, useStore } from 'zustand';
import { useNavigate } from 'react-router';
import { routesApi } from '../../api/routes-api';
import { bookingsApi } from '../../api/bookings-api';
import { useAuthStore } from '../../stores/auth-store';
import { Calendar, Clock, MapPin, Check, ArrowRight, X } from 'lucide-react';

const dateKey = (value: string) => new Date(value).toLocaleDateString('vi-VN');
const timeLabel = (value: string) => new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });

export function BookingWidget() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const queryClient = useQueryClient();

  const [store] = useState(() => createStore(() => ({ routeId: '', date: '', slotId: '', notes: '', successId: '' })));
  const ui = useStore(store);

  const routesQuery = useQuery({ queryKey: ['visitor-tour-routes'], queryFn: routesApi.getRoutes });
  const routes = routesQuery.data || [];

  const selectedRoute = routes.find(r => r.id === ui.routeId) || routes[0];
  const slotsQuery = useQuery({
    queryKey: ['visitor-tour-slots', selectedRoute?.id],
    queryFn: () => routesApi.getRouteSlots(selectedRoute!.id),
    enabled: !!selectedRoute,
  });

  const slots = slotsQuery.data || [];
  const dates = Array.from(new Map(slots.map(s => [dateKey(s.startTime), s.startTime])).entries());
  const selectedDate = dates.some(([key]) => key === ui.date) ? ui.date : dates[0]?.[0];
  const filteredSlots = slots.filter(s => dateKey(s.startTime) === selectedDate);
  const selectedSlot = filteredSlots.find(s => s.id === ui.slotId && s.available > 0);

  const bookingMutation = useMutation({
    mutationFn: () => bookingsApi.createBooking({ slotId: selectedSlot!.id, notes: ui.notes.trim() || undefined }),
    onSuccess: booking => {
      store.setState({ successId: booking.id });
      void queryClient.invalidateQueries({ queryKey: ['visitor-tour-slots'] });
    },
  });

  if (!isAuthenticated) return null; // Only show for logged in visitors

  if (ui.successId) {
    return (
      <div className="relative overflow-hidden rounded-[24px] border border-emerald-500/20 bg-[var(--bg-card)]/90 p-8 backdrop-blur-xl shadow-2xl z-10 w-full max-w-4xl mx-auto my-12 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
          <Check className="h-8 w-8" />
        </div>
        <h2 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">Hẹn gặp bạn tại campus!</h2>
        <p className="mt-4 text-sm text-slate-400 max-w-lg mx-auto">
          Đặt tour thành công. Bạn có thể xem vé và mã Check-in tự động trong mục quản lý vé của mình.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <button onClick={() => navigate('/my-bookings')} className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold flex items-center gap-2 hover:opacity-90 transition-opacity">
            Xem vé của tôi <ArrowRight className="w-4 h-4" />
          </button>
          <button onClick={() => { store.setState({ successId: '', slotId: '', notes: '' }); bookingMutation.reset(); }} className="px-6 py-3 rounded-xl border border-[var(--border-color)] text-[var(--text-primary)] font-medium hover:bg-[var(--bg-secondary)] transition-colors">
            Đặt tour khác
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-card)]/80 backdrop-blur-2xl shadow-2xl z-10 w-full max-w-6xl mx-auto my-12 p-8 lg:p-10">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-cyan-400 to-violet-500"></div>

      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-3">
            Chào {user?.username}, Đặt Tour Khám Phá Của Bạn
          </h2>
          <p className="text-sm text-slate-400 mt-2">Chọn lộ trình và thời gian bạn muốn, robot AMR sẽ đồng hành cùng bạn.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-10">
        {/* Left Col: Routes */}
        <div>
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-emerald-400 uppercase tracking-widest">
            <MapPin className="w-4 h-4" /> Chọn Lộ Trình
          </div>

          {routesQuery.isPending ? (
            <div className="p-8 text-center text-sm text-slate-400 border border-white/5 rounded-2xl bg-white/5">Đang tải lộ trình...</div>
          ) : (
            <div className="space-y-4">
              {routes.map((route) => {
                const chosen = route.id === selectedRoute?.id;
                return (
                  <button
                    key={route.id}
                    onClick={() => { store.setState({ routeId: route.id, date: '', slotId: '' }); bookingMutation.reset(); }}
                    className={`w-full text-left p-5 rounded-2xl border transition-all duration-300 ${chosen
                        ? 'border-emerald-500/50 bg-[var(--bg-secondary)] shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                        : 'border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-emerald-500/30'
                      }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className={`text-lg font-bold ${chosen ? 'text-emerald-400' : 'text-[var(--text-primary)]'}`}>{route.name}</h3>
                      {chosen && <Check className="w-5 h-5 text-emerald-400" />}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{route.description}</p>
                    <div className="mt-3 flex gap-4 text-xs font-medium text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {route.estimatedMinutes} phút</span>
                      <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {route.waypoints.length} điểm dừng</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Col: Time & Confirm */}
        <div className="flex flex-col">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-cyan-400 uppercase tracking-widest">
            <Calendar className="w-4 h-4" /> Thời gian & Xác nhận
          </div>

          <div className="flex-1 bg-black/40 rounded-3xl border border-white/10 p-6 flex flex-col">
            {slotsQuery.isPending ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">Đang tải lịch trình...</div>
            ) : !slots.length ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400">
                <X className="w-8 h-8 mb-3 text-slate-600" />
                <p className="text-sm">Lộ trình này chưa có lịch khởi hành.<br />Hãy chọn một tour khác nhé.</p>
              </div>
            ) : (
              <>
                {/* Dates */}
                <div className="mb-6">
                  <label className="block text-xs font-medium text-slate-400 mb-3">Ngày tham quan</label>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                    {dates.map(([key, value]) => {
                      const d = new Date(value);
                      const isSelected = selectedDate === key;
                      return (
                        <button
                          key={key}
                          onClick={() => { store.setState({ date: key, slotId: '' }); bookingMutation.reset(); }}
                          className={`min-w-[80px] rounded-xl border p-2 text-center transition-all ${isSelected
                              ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
                              : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/25'
                            }`}
                        >
                          <div className="text-[10px] capitalize">{d.toLocaleDateString('vi-VN', { weekday: 'short' })}</div>
                          <div className="text-xl font-bold my-1">{d.getDate().toString().padStart(2, '0')}</div>
                          <div className="text-[10px]">Tháng {d.getMonth() + 1}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Timeslots */}
                <div className="mb-6">
                  <label className="block text-xs font-medium text-slate-400 mb-3">Khung giờ</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {filteredSlots.map(slot => {
                      const isSelected = selectedSlot?.id === slot.id;
                      return (
                        <button
                          key={slot.id}
                          disabled={slot.available <= 0}
                          onClick={() => { store.setState({ slotId: slot.id }); bookingMutation.reset(); }}
                          className={`rounded-xl border p-2.5 text-center transition-all disabled:opacity-30 disabled:cursor-not-allowed ${isSelected
                              ? 'bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                              : 'bg-white/5 border-white/10 enabled:hover:border-white/25'
                            }`}
                        >
                          <div className={`text-sm font-bold ${isSelected ? 'text-cyan-300' : 'text-white'}`}>
                            {timeLabel(slot.startTime)}
                          </div>
                          <div className={`text-[10px] mt-1 font-medium ${slot.available > 3 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {slot.available > 0 ? `Còn ${slot.available} chỗ` : 'Hết chỗ'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-auto">
                  <label className="block text-xs font-medium text-slate-400 mb-2">Ghi chú (Tùy chọn)</label>
                  <input
                    type="text"
                    value={ui.notes}
                    onChange={(e) => store.setState({ notes: e.target.value })}
                    placeholder="Ngôn ngữ thuyết minh, hỗ trợ đặc biệt..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 mb-6"
                  />

                  {bookingMutation.isError && (
                    <div className="mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
                      {bookingMutation.error.message || 'Lỗi đặt tour.'}
                    </div>
                  )}

                  <button
                    disabled={!selectedSlot || bookingMutation.isPending}
                    onClick={() => bookingMutation.mutate()}
                    className="w-full py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-cyan-500 text-black hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {bookingMutation.isPending ? 'Đang xử lý...' : 'Xác nhận Đặt Tour'}
                    {!bookingMutation.isPending && <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

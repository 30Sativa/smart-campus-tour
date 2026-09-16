import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { routesApi } from '../../api/routes-api';
import type { TimeSlot } from '../../api/routes-api';
import { bookingsApi } from '../../api/bookings-api';
import { useAuthStore } from '../../stores/auth-store';
import { VisitorLayout } from '../../components/visitor/VisitorLayout';
import { GlassCard } from '../../components/visitor/GlassCard';
import { PrimaryCTA } from '../../components/visitor/PrimaryCTA';
import { motion, AnimatePresence } from 'motion/react';

const dateKey = (value: string) => new Date(value).toLocaleDateString('vi-VN');
const timeLabel = (value: string) => new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });

export default function BookingFlow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [notes, setNotes] = useState('');
  const [success, setSuccess] = useState(false);

  const { data: route, isPending: routeLoading, isError: routeError } = useQuery({
    queryKey: ['visitor-tour-route', id],
    queryFn: () => routesApi.getRouteById(id!)
  });

  const { data: slots = [], isPending: slotsLoading, isError: slotsError, refetch: refetchSlots } = useQuery({
    queryKey: ['visitor-tour-slots', id],
    queryFn: () => routesApi.getRouteSlots(id!)
  });

  const bookingMutation = useMutation({
    mutationFn: () => bookingsApi.createBooking({ slotId: selectedSlot!.id, notes: notes.trim() || undefined }),
    onSuccess: () => {
      setSuccess(true);
      void queryClient.invalidateQueries({ queryKey: ['visitor-tour-slots'] });
    }
  });

  if (routeLoading || slotsLoading) {
    return (
      <VisitorLayout>
        <div className="pt-24 px-6 flex justify-center">
          <div className="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </VisitorLayout>
    );
  }

  if (routeError || !route) {
    return <VisitorLayout><div className="pt-24 px-6 text-center">Không tìm thấy lộ trình.</div></VisitorLayout>;
  }

  if (slotsError) {
    return (
      <VisitorLayout>
        <div role="alert" className="mx-auto mt-24 max-w-md rounded-[20px] border border-red-400/20 bg-red-400/10 p-6 text-center text-sm text-red-300">
          <p>Không thể tải khung giờ. Vui lòng thử lại.</p>
          <button type="button" onClick={() => void refetchSlots()} className="mt-4 rounded-full border border-red-400/40 px-5 py-2 font-bold">Thử lại</button>
        </div>
      </VisitorLayout>
    );
  }

  const dates = Array.from(new Map(slots.map(s => [dateKey(s.startTime), s.startTime])).entries());
  const activeDate = selectedDate || dates[0]?.[0] || '';
  const filteredSlots = slots.filter(s => dateKey(s.startTime) === activeDate);

  if (success) {
    return (
      <VisitorLayout>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div role="dialog" aria-labelledby="booking-success-title" className="max-w-[400px] w-full">
          <GlassCard className="w-full p-10 text-center">
            <div className="w-20 h-20 mx-auto bg-emerald-400/20 text-emerald-400 rounded-full flex items-center justify-center mb-6">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 id="booking-success-title" className="text-2xl font-bold mb-4">Đặt tour thành công!</h2>
            <p className="text-[var(--text-secondary)] text-sm mb-8 leading-relaxed">
              Robot CampusTour sẽ sẵn sàng đón bạn vào lúc {timeLabel(selectedSlot!.startTime)}. Hẹn gặp lại bạn tại điểm khởi hành!
            </p>
            <div className="flex flex-col gap-4">
              <PrimaryCTA to="/my-bookings" className="w-full">
                Xem tour của tôi
              </PrimaryCTA>
              <Link to="/tours" className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                Về trang chủ
              </Link>
            </div>
          </GlassCard>
          </div>
        </div>
      </VisitorLayout>
    );
  }

  return (
    <VisitorLayout>
      <div className="pt-8 md:pt-16 pb-24 px-6 max-w-[600px] mx-auto min-h-[80vh]">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <button onClick={() => step > 1 ? setStep((s) => (s - 1) as 1 | 2) : navigate(`/tours/${id}`)} className="w-10 h-10 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center hover:bg-[var(--bg-secondary)] transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--accent)] font-bold mb-1">
              {route.name}
            </div>
            <h1 className="text-2xl font-bold">Đặt lịch tham quan</h1>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex justify-between relative mb-12">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-[var(--bg-secondary)] -z-10 -translate-y-1/2" />
          {[1, 2, 3].map((s) => (
            <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= s ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-color)]'}`}>
              {s}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 1: DATE */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="text-lg font-bold">Chọn ngày tham quan</h2>
              {dates.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-[var(--border-color)] rounded-[20px] text-[var(--text-secondary)] text-sm">
                  Chưa có lịch khởi hành cho tuyến này.
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {dates.map(([key, value]) => {
                    const d = new Date(value);
                    const isSelected = activeDate === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedDate(key)}
                        className={`p-4 rounded-[20px] border transition-all text-center ${isSelected ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--border-color)] text-[var(--text-primary)]'}`}
                      >
                        <div className="text-[10px] uppercase font-bold opacity-60 mb-2">
                          {d.toLocaleDateString('vi-VN', { weekday: 'short' })}
                        </div>
                        <div className="text-2xl font-bold mb-1">
                          {d.getDate().toString().padStart(2, '0')}
                        </div>
                        <div className="text-xs opacity-80">
                          Tháng {d.getMonth() + 1}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="pt-6">
                <PrimaryCTA className="w-full" disabled={!activeDate} onClick={() => setStep(2)}>
                  Tiếp tục
                </PrimaryCTA>
              </div>
            </motion.div>
          )}

          {/* STEP 2: TIME */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="text-lg font-bold">Chọn khung giờ</h2>
              {filteredSlots.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-[var(--border-color)] rounded-[20px] text-[var(--text-secondary)] text-sm">
                  Không còn chỗ trống trong ngày này.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredSlots.map(slot => {
                    const isSelected = selectedSlot?.id === slot.id;
                    const available = slot.available > 0;
                    return (
                      <button
                        key={slot.id}
                        disabled={!available}
                        onClick={() => setSelectedSlot(slot)}
                        className={`p-5 rounded-[20px] border text-left transition-all ${!available ? 'opacity-40 cursor-not-allowed border-[var(--border-color)] bg-[var(--bg-secondary)]' : isSelected ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]' : 'border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--border-color)] text-[var(--text-primary)]'}`}
                      >
                        <div className="text-lg font-bold tracking-tight mb-2">
                          {timeLabel(slot.startTime)} - {timeLabel(slot.endTime)}
                        </div>
                        <div className={`text-xs font-bold flex items-center gap-2 ${available ? 'text-[var(--accent)]' : 'text-red-400'}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {available ? `Còn ${slot.available} chỗ` : 'Đã hết chỗ'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="pt-6">
                <PrimaryCTA className="w-full" disabled={!selectedSlot} onClick={() => setStep(3)}>
                  Tiếp tục
                </PrimaryCTA>
              </div>
            </motion.div>
          )}

          {/* STEP 3: CONFIRM */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="text-lg font-bold">Xác nhận thông tin</h2>
              
              <GlassCard className="p-6 space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-[var(--border-color)]">
                  <span className="text-xs text-[var(--text-secondary)]">Lộ trình</span>
                  <span className="text-sm font-bold text-[var(--text-primary)] text-right max-w-[60%] line-clamp-1">{route.name}</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-[var(--border-color)]">
                  <span className="text-xs text-[var(--text-secondary)]">Thời gian</span>
                  <span className="text-sm font-bold text-[var(--accent)] text-right">
                    {timeLabel(selectedSlot!.startTime)} - {activeDate}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[var(--text-secondary)]">Khách</span>
                  <span className="text-sm font-bold text-[var(--text-primary)] text-right">1 người</span>
                </div>
              </GlassCard>

              <div className="pt-4">
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-3 uppercase tracking-wider">
                  Ghi chú thêm (Tùy chọn)
                </label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Yêu cầu đặc biệt..."
                  className="w-full h-24 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-[16px] p-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors resize-none"
                />
              </div>

              {bookingMutation.isError && (
                <div className="p-4 bg-red-400/10 text-red-400 text-xs rounded-xl border border-red-400/20 text-center">
                  Đặt tour thất bại. Vui lòng thử lại.
                </div>
              )}

              <div className="pt-6">
                {!isAuthenticated ? (
                  <PrimaryCTA className="w-full" onClick={() => navigate('/login')}>
                    Đăng nhập để đặt tour
                  </PrimaryCTA>
                ) : (
                  <PrimaryCTA 
                    className="w-full" 
                    disabled={bookingMutation.isPending}
                    onClick={() => bookingMutation.mutate()}
                  >
                    {bookingMutation.isPending ? 'Đang xử lý...' : 'Xác nhận đặt tour'}
                  </PrimaryCTA>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </VisitorLayout>
  );
}


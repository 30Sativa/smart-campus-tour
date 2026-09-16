import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bookingsApi } from '../../api/bookings-api';

import { VisitorLayout } from '../../components/visitor/VisitorLayout';
import { GlassCard } from '../../components/visitor/GlassCard';
import { StatusBadge } from '../../components/visitor/StatusBadge';
import { PrimaryCTA } from '../../components/visitor/PrimaryCTA';
import { motion, AnimatePresence } from 'motion/react';

const timeLabel = (value: string) => new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
const dateLabel = (value: string) => new Date(value).toLocaleDateString('vi-VN');

export default function MyBookingsPage() {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'active' | 'completed'>('upcoming');

  const { data: bookings = [], isPending } = useQuery({
    queryKey: ['visitor-my-bookings'],
    queryFn: bookingsApi.getMyBookings
  });

  const now = new Date();
  
  const filteredBookings = bookings.filter(b => {
    // For demo purposes, we will mock the active state if status is Pending and time is close
    const start = new Date(b.startTime);
    const end = new Date(b.endTime);
    
    if (activeTab === 'completed') {
      return b.status === 'Completed' || b.status === 'Cancelled' || end < now;
    }
    
    if (activeTab === 'active') {
      // Mock logic: if it's today and within the time window or explicitly "Active" status if it existed
      return start <= now && end >= now && b.status !== 'Completed' && b.status !== 'Cancelled';
    }
    
    // upcoming
    return start > now && b.status !== 'Completed' && b.status !== 'Cancelled';
  });

  return (
    <VisitorLayout>
      <div className="pt-8 md:pt-16 pb-32 px-6 max-w-[1080px] mx-auto min-h-[80vh]">
        <div className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--accent)] mb-3">
            TOUR CỦA TÔI
          </div>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            Hành trình của bạn.
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-[var(--border-color)] pb-1 overflow-x-auto hide-scrollbar">
          {(['upcoming', 'active', 'completed'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-bold tracking-wide transition-colors relative whitespace-nowrap px-2 ${activeTab === tab ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'}`}
            >
              {tab === 'upcoming' && 'SẮP TỚI'}
              {tab === 'active' && 'ĐANG DIỄN RA'}
              {tab === 'completed' && 'ĐÃ HOÀN TẤT'}
              {activeTab === tab && (
                <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)]" />
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-4">
          {isPending && (
            <div className="space-y-4">
              {[1, 2].map(i => <div key={i} className="h-32 bg-[var(--bg-secondary)] rounded-[24px] animate-pulse" />)}
            </div>
          )}

          {!isPending && filteredBookings.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 text-center">
              <div className="w-16 h-16 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center mx-auto mb-4 text-[var(--text-secondary)]">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-6">Bạn chưa có chuyến tham quan nào.</p>
              <PrimaryCTA to="/tours">Khám phá tour ngay</PrimaryCTA>
            </motion.div>
          )}

          <AnimatePresence mode="popLayout">
            {!isPending && filteredBookings.map((booking) => (
              <motion.div
                key={booking.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
              >
                <GlassCard hoverEffect variant={activeTab === 'active' ? 'accent' : 'dark'} className="p-5 md:p-6 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <StatusBadge 
                        status={
                          booking.status === 'Cancelled' ? 'error' : 
                          activeTab === 'active' ? 'moving' : 
                          activeTab === 'completed' ? 'completed' : 'waiting'
                        } 
                        text={
                          booking.status === 'Cancelled' ? 'Đã hủy' : 
                          activeTab === 'active' ? 'Đang diễn ra' : 
                          activeTab === 'completed' ? 'Đã kết thúc' : 'Sắp khởi hành'
                        }
                        animate={activeTab === 'active'}
                      />
                      <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-widest">
                        {dateLabel(booking.startTime)}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold mb-1 tracking-tight text-[var(--text-primary)]">{booking.routeName}</h3>
                    <p className="text-sm font-bold text-[var(--accent)]">
                      {timeLabel(booking.startTime)} - {timeLabel(booking.endTime)}
                    </p>
                  </div>
                  
                  <div className="w-full md:w-auto shrink-0 flex gap-3">
                    {activeTab === 'active' && (
                      <PrimaryCTA to={`/live-tour/${booking.id}`} className="w-full md:w-auto">
                        Tiếp tục tour
                      </PrimaryCTA>
                    )}
                    {activeTab === 'upcoming' && (
                      <PrimaryCTA to={`/tours`} className="w-full md:w-auto">
                        Khám phá thêm
                      </PrimaryCTA>
                    )}
                    {activeTab === 'completed' && booking.status !== 'Cancelled' && !booking.feedbackRating && (
                      <PrimaryCTA to={`/feedback/${booking.id}`} className="w-full md:w-auto">
                        Đánh giá
                      </PrimaryCTA>
                    )}
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </VisitorLayout>
  );
}


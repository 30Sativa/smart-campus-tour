import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { bookingsApi } from '../../api/bookings-api';
import { routesApi } from '../../api/routes-api';
import { VisitorLayout } from '../../components/visitor/VisitorLayout';
import { GlassCard } from '../../components/visitor/GlassCard';
import { motion, AnimatePresence } from 'motion/react';

export default function LiveTour() {
  const { id } = useParams();
  
  // In a real implementation, we would subscribe to a WebSocket or poll for robot position
  // For now, we mock the progress through the waypoints
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState(0);
  const [status, setStatus] = useState<'moving' | 'arrived'>('moving');

  const { data: booking, isPending: bookingLoading } = useQuery({
    queryKey: ['visitor-tour-booking', id],
    queryFn: () => bookingsApi.getBooking(id!)
  });

  const { data: routes, isPending: routeLoading } = useQuery({
    queryKey: ['visitor-tour-routes'],
    queryFn: routesApi.getRoutes,
  });

  const route = routes?.find((candidate) => candidate.name === booking?.routeName);

  useEffect(() => {
    if (!route || route.waypoints.length === 0) return;
    
    // Mock simulation: move to next waypoint every 10 seconds, pause for 5 seconds when arrived
    const interval = setInterval(() => {
      setStatus(prev => {
        if (prev === 'moving') {
          return 'arrived';
        } else {
          setCurrentWaypointIndex(idx => Math.min(idx + 1, route.waypoints.length - 1));
          return 'moving';
        }
      });
    }, 8000);
    
    return () => clearInterval(interval);
  }, [route]);

  if (bookingLoading || routeLoading) {
    return (
      <VisitorLayout>
        <div className="pt-24 px-6 flex justify-center">
          <div className="w-8 h-8 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      </VisitorLayout>
    );
  }

  if (!booking || !route) {
    return <VisitorLayout><div className="pt-24 text-center">Không tìm thấy thông tin chuyến đi.</div></VisitorLayout>;
  }

  const waypoints = [...route.waypoints].sort((a,b) => a.order - b.order);
  const currentWaypoint = waypoints[currentWaypointIndex];
  const isCompleted = currentWaypointIndex >= waypoints.length - 1 && status === 'arrived';

  return (
    <VisitorLayout>
      <div className="pt-6 md:pt-10 pb-32 px-4 max-w-[600px] mx-auto min-h-screen flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Link to="/my-bookings" className="w-10 h-10 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center hover:bg-[var(--bg-secondary)] transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <div>
              <div className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">
                Đang diễn ra
              </div>
              <div className="text-sm font-bold truncate max-w-[200px]">{route.name}</div>
            </div>
          </div>
          <div className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-primary)]">
            {currentWaypointIndex + 1} / {waypoints.length} POIs
          </div>
        </div>

        <p role="note" className="mb-6 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">Bản mô phỏng hành trình. Vị trí và tiến độ dưới đây chưa kết nối với robot thực tế.</p>
        {/* Status Hero */}
        <GlassCard variant={status === 'moving' ? 'dark' : 'accent'} className="p-6 mb-8 relative overflow-visible">
          {status === 'moving' && (
            <motion.div 
              className="absolute -inset-10 bg-[var(--accent)]/10 rounded-full blur-3xl -z-10"
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
          
          <div className="flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-full bg-black/40 border border-[var(--border-color)] flex items-center justify-center mb-6 relative">
              {status === 'moving' ? (
                <>
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-full border border-dashed border-[var(--accent)] opacity-50"
                  />
                  <svg className="w-10 h-10 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="4" y="8" width="16" height="12" rx="4" />
                    <path d="M12 4v4M8 13v1m8-1v1M9 17h6M1 12v4m22-4v4" />
                    <circle cx="12" cy="3" r="1" />
                  </svg>
                </>
              ) : (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-emerald-400"
                >
                  <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </motion.div>
              )}
            </div>

            <h2 className="text-2xl font-bold mb-2">
              {status === 'moving' ? `Đang di chuyển đến ${currentWaypoint?.label || 'điểm tiếp theo'}` : `Bạn đã đến ${currentWaypoint?.label}`}
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {status === 'moving' ? 'Robot đang dẫn đường. Vui lòng đi theo robot.' : 'Robot đã dừng. Bạn có thể bắt đầu khám phá.'}
            </p>
          </div>
        </GlassCard>

        {/* Current POI Info if arrived */}
        <AnimatePresence>
          {status === 'arrived' && currentWaypoint?.poi && !isCompleted && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8"
            >
              <GlassCard className="p-5 flex gap-4 items-center">
                <div className="w-16 h-16 rounded-xl bg-[var(--bg-secondary)] shrink-0 overflow-hidden">
                   {currentWaypoint.poi.imageUrl ? (
                     <img src={currentWaypoint.poi.imageUrl} alt="" className="w-full h-full object-cover" />
                   ) : (
                     <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                       <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                     </div>
                   )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">{currentWaypoint.poi.name}</h3>
                  <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{currentWaypoint.poi.description}</p>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress Map (Horizontal line) */}
        <div className="mt-auto mb-8 px-2">
          <div className="relative flex items-center justify-between">
            <div className="absolute left-0 right-0 h-1 bg-[var(--bg-secondary)] top-1/2 -translate-y-1/2 z-0 rounded-full" />
            <motion.div 
              className="absolute left-0 h-1 bg-[var(--accent)] top-1/2 -translate-y-1/2 z-0 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(currentWaypointIndex / (waypoints.length - 1)) * 100}%` }}
              transition={{ duration: 1 }}
            />
            
            {waypoints.map((wp, idx) => {
              const isPast = idx < currentWaypointIndex;
              const isCurrent = idx === currentWaypointIndex;
              
              return (
                <div key={wp.id} className="relative z-10 flex flex-col items-center">
                  <div className={`w-4 h-4 rounded-full border-4 ${isPast ? 'bg-[var(--accent)] border-[var(--bg-primary)]' : isCurrent ? 'bg-[var(--accent)] border-[var(--border-color)]' : 'bg-[var(--bg-secondary)] border-[var(--bg-primary)]'} transition-colors duration-500`} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-3 px-1">
            <span className="text-[10px] font-bold text-[var(--text-secondary)]">Khởi hành</span>
            <span className="text-[10px] font-bold text-[var(--text-secondary)]">Kết thúc</span>
          </div>
        </div>

        {/* Floating AI CTA */}
        {isCompleted ? (
           <Link 
            to={`/feedback/${booking.id}`}
            className="w-full flex items-center justify-center gap-3 bg-white text-black py-4 rounded-[20px] font-bold text-sm hover:scale-[0.98] transition-transform"
          >
            Hoàn tất chuyến đi
          </Link>
        ) : (
          <Link 
            to="/ai-guide" 
            className="w-full flex items-center justify-center gap-3 bg-[var(--bg-card)] border border-[var(--accent)]/30 text-[var(--text-primary)] py-4 rounded-[20px] font-bold text-sm shadow-[0_0_30px_rgba(16,185,129,0.15)] hover:bg-[var(--accent)] hover:text-black transition-all group"
          >
            <svg className="w-5 h-5 text-[var(--accent)] group-hover:text-black transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
            Hỏi trợ lý CampusTour
          </Link>
        )}

      </div>
    </VisitorLayout>
  );
}



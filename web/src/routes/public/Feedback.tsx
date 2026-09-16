import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingsApi } from '../../api/bookings-api';
import { VisitorLayout } from '../../components/visitor/VisitorLayout';
import { GlassCard } from '../../components/visitor/GlassCard';
import { PrimaryCTA } from '../../components/visitor/PrimaryCTA';
import { motion, AnimatePresence } from 'motion/react';

export default function Feedback() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const feedbackMutation = useMutation({
    mutationFn: () => bookingsApi.submitFeedback(id!, { rating, comment }),
    onSuccess: () => {
      setSubmitted(true);
      void queryClient.invalidateQueries({ queryKey: ['visitor-my-bookings'] });
    }
  });

  return (
    <VisitorLayout>
      <div className="pt-12 md:pt-24 pb-32 px-6 max-w-[600px] mx-auto min-h-screen">
        <AnimatePresence mode="wait">
          {!submitted ? (
            <motion.div key="form" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <div className="text-center mb-10">
                <div className="w-16 h-16 bg-emerald-400/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h1 className="text-3xl font-bold tracking-tight mb-3">Chuyến đi thế nào?</h1>
                <p className="text-[var(--text-secondary)] text-sm">
                  Cảm ơn bạn đã tham gia CampusTour. Đánh giá của bạn giúp chúng tôi cải thiện dịch vụ.
                </p>
              </div>

              <GlassCard className="p-8 space-y-8">
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      className="p-2 transition-transform hover:scale-110"
                    >
                      <svg 
                        className={`w-10 h-10 transition-colors duration-300 ${star <= (hoveredRating || rating) ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]' : 'text-[var(--text-secondary)]'}`} 
                        viewBox="0 0 24 24" 
                        stroke="currentColor" 
                        strokeWidth="1.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-3 uppercase tracking-wider">
                    Chia sẻ thêm (Tùy chọn)
                  </label>
                  <textarea 
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Điều gì làm bạn ấn tượng nhất?"
                    className="w-full h-32 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-[16px] p-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors resize-none"
                  />
                </div>

                <div className="pt-2">
                  <PrimaryCTA 
                    className="w-full"
                    disabled={rating === 0 || feedbackMutation.isPending}
                    onClick={() => feedbackMutation.mutate()}
                  >
                    {feedbackMutation.isPending ? 'Đang gửi...' : 'Gửi đánh giá'}
                  </PrimaryCTA>
                </div>
              </GlassCard>
            </motion.div>
          ) : (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center pt-20">
              <div className="w-24 h-24 mx-auto bg-[var(--accent)]/20 text-[var(--accent)] rounded-full flex items-center justify-center mb-8 relative">
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-full border-2 border-[var(--accent)]/50"
                />
                <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold mb-4">Cảm ơn bạn!</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-10 leading-relaxed max-w-[300px] mx-auto">
                Đánh giá của bạn đã được ghi nhận. Hẹn gặp lại bạn ở những hành trình tiếp theo.
              </p>
              <PrimaryCTA onClick={() => navigate('/tours')}>
                Khám phá thêm tour khác
              </PrimaryCTA>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </VisitorLayout>
  );
}


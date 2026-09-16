import { motion } from 'motion/react';

type StatusType = 'idle' | 'moving' | 'waiting' | 'completed' | 'error';

interface StatusBadgeProps {
  status: StatusType;
  text: string;
  animate?: boolean;
}

export function StatusBadge({ status, text, animate = true }: StatusBadgeProps) {
  const getStyle = () => {
    switch (status) {
      case 'moving':
        return {
          bg: 'bg-[rgba(16,185,129,0.15)]',
          border: 'border-[rgba(16,185,129,0.3)]',
          text: 'text-emerald-400',
          dot: 'bg-emerald-400'
        };
      case 'waiting':
        return {
          bg: 'bg-[rgba(245,158,11,0.15)]',
          border: 'border-[rgba(245,158,11,0.3)]',
          text: 'text-amber-400',
          dot: 'bg-amber-400'
        };
      case 'completed':
        return {
          bg: 'bg-[rgba(6,182,212,0.15)]',
          border: 'border-[rgba(6,182,212,0.3)]',
          text: 'text-cyan-400',
          dot: 'bg-cyan-400'
        };
      case 'error':
        return {
          bg: 'bg-[rgba(239,68,68,0.15)]',
          border: 'border-[rgba(239,68,68,0.3)]',
          text: 'text-red-400',
          dot: 'bg-red-400'
        };
      case 'idle':
      default:
        return {
          bg: 'bg-[rgba(255,255,255,0.05)]',
          border: 'border-[rgba(255,255,255,0.1)]',
          text: 'text-[var(--text-secondary)]',
          dot: 'bg-[var(--text-secondary)]'
        };
    }
  };

  const style = getStyle();

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-md ${style.bg} ${style.border}`}>
      <div className="relative flex items-center justify-center w-2 h-2">
        {animate && status !== 'idle' && status !== 'completed' && status !== 'error' && (
          <motion.div
            className={`absolute inset-0 rounded-full ${style.dot} opacity-50`}
            animate={{ scale: [1, 2.5], opacity: [0.5, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <div className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      </div>
      <span className={`text-[11px] font-bold tracking-wide uppercase ${style.text}`}>
        {text}
      </span>
    </div>
  );
}

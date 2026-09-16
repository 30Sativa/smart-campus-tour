import { motion } from 'motion/react';
import { ArrowUpRight, Calendar, Heart, MapPin, Bell } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: number;
  icon: 'calendar' | 'heart' | 'map' | 'bell';
  trend?: { value: number; positive: boolean };
}

const icons: Record<StatCardProps['icon'], LucideIcon> = {
  calendar: Calendar,
  heart: Heart,
  map: MapPin,
  bell: Bell,
};

export function StatCard({ label, value, icon, trend }: StatCardProps) {
  const Icon = icons[icon];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-[var(--accent)]/30 hover:bg-white/[0.05]"
    >
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-[var(--accent)]/10 to-transparent opacity-50 blur-2xl transition-opacity duration-300 group-hover:opacity-75" />

      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-[var(--accent)] shadow-inner">
            <Icon size={18} strokeWidth={2} aria-hidden="true" />
          </div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/50">{label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-white">{value}</span>
            {trend && (
              <span className={`flex items-center gap-0.5 text-xs font-bold ${trend.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                <ArrowUpRight size={12} strokeWidth={2.5} className={trend.positive ? '' : 'rotate-90'} aria-hidden="true" />
                {trend.value}%
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

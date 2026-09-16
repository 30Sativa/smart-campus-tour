import type { ReactNode } from 'react';
import type { StatusTone } from './admin-dashboard.data';

const toneClasses: Record<StatusTone, string> = {
  success: 'border-emerald-700/20 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-700/20 bg-amber-50 text-amber-900',
  danger: 'border-red-700/20 bg-red-50 text-red-800',
  info: 'border-sky-700/20 bg-sky-50 text-sky-800',
  neutral: 'border-slate-400/30 bg-slate-100 text-slate-700',
};

interface StatusBadgeProps {
  children: ReactNode;
  icon?: ReactNode;
  tone?: StatusTone;
}

export function StatusBadge({ children, icon, tone = 'neutral' }: StatusBadgeProps) {
  return (
    <span className={`inline-flex min-h-6 items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${toneClasses[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

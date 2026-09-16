import { Link } from 'react-router';
import {
  CalendarPlus,
  Heart,
  Map,
  QrCode,
  Sparkles,
  Ticket,
  type LucideIcon,
} from 'lucide-react';
import type { QuickAction } from '../../data/user-dashboard-mock';

const icons: Record<QuickAction['icon'], LucideIcon> = {
  calendar: CalendarPlus,
  ticket: Ticket,
  qrcode: QrCode,
  map: Map,
  heart: Heart,
  sparkles: Sparkles,
};

const accents: Record<QuickAction['color'], string> = {
  accent: 'from-emerald-400/20 to-cyan-400/5 text-emerald-300 group-hover:border-emerald-400/40',
  cyan: 'from-cyan-400/20 to-blue-400/5 text-cyan-300 group-hover:border-cyan-400/40',
  emerald: 'from-teal-400/20 to-emerald-400/5 text-teal-300 group-hover:border-teal-400/40',
  amber: 'from-amber-400/20 to-orange-400/5 text-amber-300 group-hover:border-amber-400/40',
};

export function QuickActionCard({ action }: { action: QuickAction }) {
  const Icon = icons[action.icon];

  return (
    <Link
      to={action.link}
      className={`group relative overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br ${accents[action.color]} p-5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#071014]`}
    >
      <span className="mb-8 grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-black/20 shadow-inner">
        <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <h3 className="text-sm font-bold tracking-tight text-white">{action.title}</h3>
      <p className="mt-1 text-xs text-white/55">{action.description}</p>
      <span className="absolute right-5 bottom-5 text-sm text-white/35 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-white" aria-hidden="true">
        →
      </span>
    </Link>
  );
}

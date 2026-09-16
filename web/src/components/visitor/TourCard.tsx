import { Link } from 'react-router';
import { ArrowUpRight, Clock3, MapPin } from 'lucide-react';

interface TourCardProps {
  id?: string;
  name: string;
  image: string;
  duration: string;
  poiCount: number;
  description: string;
  linkTo: string;
  ctaText?: string;
}

export function TourCard({ name, image, duration, poiCount, description, linkTo, ctaText = 'Xem chi tiết' }: TourCardProps) {
  return (
    <Link to={linkTo} className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-[var(--border-color)] bg-[var(--bg-card)] transition-colors hover:border-[var(--accent)]/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">
      <div className="aspect-[16/10] overflow-hidden bg-[var(--bg-secondary)]">
        <img src={image} alt={name} loading="lazy" onError={event => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = '/images/hero-campus.jpg';
        }} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:transform-none" />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5"><Clock3 size={14} />{duration}</span>
          <span className="flex items-center gap-1.5"><MapPin size={14} />{poiCount} điểm tham quan</span>
        </div>
        <h3 className="mb-3 text-xl font-semibold leading-snug tracking-tight text-[var(--text-primary)]">{name}</h3>
        <p className="mb-6 line-clamp-2 text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>
        <div className="mt-auto flex items-center justify-between border-t border-[var(--border-color)] pt-4 text-sm font-semibold">
          {ctaText}
          <span className="flex size-9 items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-primary)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-[#071014]"><ArrowUpRight size={18} /></span>
        </div>
      </div>
    </Link>
  );
}

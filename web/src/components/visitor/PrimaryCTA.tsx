import type { ReactNode } from 'react';
import { Link } from 'react-router';

interface PrimaryCTAProps {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
  className?: string;
  icon?: ReactNode;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}

export function PrimaryCTA({ children, to, onClick, className = '', icon, type = 'button', disabled = false }: PrimaryCTAProps) {
  const style = `inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-bold !text-[#071014] transition-colors hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`;
  const content = <>{children}{icon && <span className="ml-2">{icon}</span>}</>;
  if (to && !disabled) return <Link to={to} onClick={onClick} className={style}>{content}</Link>;
  return <button type={type} disabled={disabled} onClick={onClick} className={style}>{content}</button>;
}


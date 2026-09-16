import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface GlassCardProps extends React.ComponentProps<typeof motion.div> {
  children: React.ReactNode;
  variant?: 'dark' | 'light' | 'accent';
  hoverEffect?: boolean;
}

export function GlassCard({ children, className = '', variant = 'dark', hoverEffect = false, ...props }: GlassCardProps) {
  const reduceMotion = useReducedMotion();
  const background = variant === 'accent' ? 'bg-[var(--accent)]/5' : 'bg-[var(--bg-card)]';
  return (
    <motion.div whileHover={hoverEffect && !reduceMotion ? { y: -3 } : undefined}
      className={`relative overflow-hidden rounded-[24px] border border-[var(--border-color)] ${background} ${className}`} {...props}>
      {children}
    </motion.div>
  );
}

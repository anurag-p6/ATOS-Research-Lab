import type { ReactNode } from 'react';

export type BadgeTone = 'cyan' | 'amber' | 'danger' | 'success' | 'neutral';

const TONE: Record<BadgeTone, string> = {
  cyan: 'atos-chip-cyan',
  amber: 'atos-chip-amber',
  danger: 'atos-chip-danger',
  success: 'atos-chip-success',
  neutral: '',
};

export function Badge({
  tone = 'neutral',
  children,
  className = '',
  title,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span title={title} className={`atos-chip ${TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}

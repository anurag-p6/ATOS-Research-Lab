import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
  state = 'idle',
  as: As = 'section',
}: {
  children: ReactNode;
  className?: string;
  state?: 'idle' | 'online' | 'offline';
  as?: 'section' | 'article' | 'div' | 'aside';
}) {
  const stateClass =
    state === 'online'
      ? 'atos-card-online'
      : state === 'offline'
        ? 'atos-card-offline'
        : '';
  return <As className={`atos-card ${stateClass} ${className}`}>{children}</As>;
}

export function CardHeader({
  title,
  subtitle,
  right,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex items-start justify-between gap-3 px-4 pt-3.5 ${className}`}>
      <div className="min-w-0">
        <h3 className="atos-heading text-[13px] font-medium uppercase tracking-[0.2em] text-operator-text">
          {title}
        </h3>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-operator-muted">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}

export function CardBody({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-4 pb-4 pt-3 ${className}`}>{children}</div>;
}

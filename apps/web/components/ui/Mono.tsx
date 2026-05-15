'use client';

import { CopyButton } from './CopyButton';
import { truncateMiddle } from '@/lib/format';

export function Mono({
  value,
  head = 6,
  tail = 4,
  copy = false,
  className = '',
  title,
}: {
  value: string | null | undefined;
  head?: number;
  tail?: number;
  copy?: boolean;
  className?: string;
  title?: string;
}) {
  if (!value) {
    return <span className={`atos-mono text-operator-muted ${className}`}>—</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        title={title ?? value}
        className="atos-mono text-operator-text/90"
      >
        {truncateMiddle(value, head, tail)}
      </span>
      {copy ? <CopyButton value={value} label="Copy value" /> : null}
    </span>
  );
}

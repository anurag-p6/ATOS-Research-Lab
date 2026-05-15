'use client';

import { useMemo } from 'react';
import { stableStringify } from '@/lib/format';

export function JsonViewer({
  value,
  className = '',
  maxHeight = 320,
}: {
  value: unknown;
  className?: string;
  maxHeight?: number;
}) {
  const text = useMemo(() => stableStringify(value, 2), [value]);
  return (
    <pre
      className={`atos-mono overflow-auto whitespace-pre-wrap break-all rounded-md border border-line bg-bg-sunken/70 p-3 text-[11.5px] leading-relaxed text-operator-text/90 ${className}`}
      style={{ maxHeight }}
    >
      {text}
    </pre>
  );
}

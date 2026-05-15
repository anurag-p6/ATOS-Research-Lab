'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyToClipboard } from '@/lib/format';

export function CopyButton({
  value,
  label = 'Copy',
  className = '',
  size = 14,
}: {
  value: string;
  label?: string;
  className?: string;
  size?: number;
}) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={copied ? 'Copied' : label}
      className={`inline-flex items-center gap-1 rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-operator-muted transition-colors hover:border-operator-cyan/60 hover:text-operator-cyan ${className}`}
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
      <span className="sr-only">{label}</span>
    </button>
  );
}

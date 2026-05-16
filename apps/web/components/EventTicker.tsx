'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AgentRole, TaggedEvent } from '@/lib/agents';
import { relativeTime, truncateMiddle } from '@/lib/format';

const ROLE_COLOR: Record<AgentRole, string> = {
  deployer: 'border-operator-cyan/50 text-operator-cyan',
  monitor: 'border-operator-amber/50 text-operator-amber',
  governance: 'border-operator-success/50 text-operator-success',
};

interface EventsResponse {
  total: number;
  fetchedAt: number;
  events: TaggedEvent[];
}

async function fetchEvents(signal: AbortSignal): Promise<EventsResponse> {
  const res = await fetch('/api/events', { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`events ${res.status}`);
  return (await res.json()) as EventsResponse;
}

export function EventTicker() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const events = useQuery({
    queryKey: ['events'],
    queryFn: ({ signal }) => fetchEvents(signal),
    refetchInterval: 4000,
  });

  const items = useMemo(
    () => (events.data?.events ?? []).slice(0, 30),
    [events.data],
  );

  // duplicate the row to make the marquee seamless
  const row = items.length > 0 ? [...items, ...items] : [];

  return (
    <div
      role="status"
      aria-label="pubsub activity ticker"
      className="atos-respect-reduced-motion fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg-sunken/85 backdrop-blur"
    >
      <div className="flex items-center gap-3 overflow-hidden px-3 py-1.5">
        <span className="atos-chip atos-chip-cyan shrink-0">
          <span className="atos-dot atos-dot-cyan animate-pulse-cyan" aria-hidden="true" />
          pubsub
        </span>
        <div className="relative flex-1 overflow-hidden">
          {items.length === 0 ? (
            <p className="atos-mono text-[11px] text-operator-muted">
              {`> no_signal — gossipsub idle`}
            </p>
          ) : (
            <div
              className="flex w-max gap-2 animate-ticker"
              style={{ animationDuration: `${Math.max(20, row.length * 2)}s` }}
            >
              {row.map((e, idx) => {
                const displayCid = e.ipldCid ?? e.id;
                return (
                  <span
                    key={`${e.origin}-${e.id}-${idx}`}
                    className={`atos-chip atos-mono ${ROLE_COLOR[e.origin]} shrink-0`}
                    title={`${e.topic} · CID: ${displayCid}`}
                  >
                    <span className="text-operator-muted">{e.topic}</span>
                    <span className="text-operator-text/85">{e.origin}</span>
                    <span className="text-operator-muted">
                      {truncateMiddle(displayCid, 5, 4)}
                    </span>
                    <span className="text-operator-muted">
                      {now ? relativeTime(e.timestamp, now) : ''}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

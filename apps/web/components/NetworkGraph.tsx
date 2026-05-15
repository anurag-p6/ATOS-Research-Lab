'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AgentRole, TaggedEvent } from '@/lib/agents';
import { Card, CardBody, CardHeader } from './ui/Card';
import type { AgentsResponse } from '@/lib/types';

const NODES: { role: AgentRole; x: number; y: number; label: string }[] = [
  { role: 'deployer', x: 100, y: 60, label: 'Deployer' },
  { role: 'monitor', x: 240, y: 200, label: 'Monitor' },
  { role: 'governance', x: 360, y: 70, label: 'Governance' },
];

const EDGES: [AgentRole, AgentRole][] = [
  ['deployer', 'monitor'],
  ['monitor', 'governance'],
  ['governance', 'deployer'],
];

async function fetchAgents(signal: AbortSignal): Promise<AgentsResponse> {
  const res = await fetch('/api/agents', { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`agents ${res.status}`);
  return (await res.json()) as AgentsResponse;
}

async function fetchEvents(signal: AbortSignal): Promise<{
  events: TaggedEvent[];
  fetchedAt: number;
  total: number;
}> {
  const res = await fetch('/api/events', { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`events ${res.status}`);
  return (await res.json()) as { events: TaggedEvent[]; fetchedAt: number; total: number };
}

export function NetworkGraph() {
  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: ({ signal }) => fetchAgents(signal),
    refetchInterval: 5000,
  });
  const events = useQuery({
    queryKey: ['events'],
    queryFn: ({ signal }) => fetchEvents(signal),
    refetchInterval: 4000,
  });

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  /** Roles that have received a pubsub message in the last 3 seconds. */
  const recentlyActive = useMemo(() => {
    const out = new Set<AgentRole>();
    if (!now) return out;
    for (const e of events.data?.events ?? []) {
      if (now - e.timestamp <= 3000) {
        out.add(e.origin);
        out.add(e.role);
      }
    }
    return out;
  }, [events.data, now]);

  const status = agents.data;

  return (
    <Card state="idle">
      <CardHeader title="Network graph" subtitle="gossipsub mesh — atos/tasks · atos/status · atos/heartbeat" />
      <CardBody className="px-3 pb-3 pt-2">
        <svg
          role="img"
          aria-label="ATOS agent network graph"
          viewBox="0 0 460 260"
          className="atos-respect-reduced-motion w-full"
        >
          <defs>
            <radialGradient id="atos-node-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="atos-node-glow-danger" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* edges */}
          {EDGES.map(([a, b]) => {
            const na = NODES.find((n) => n.role === a)!;
            const nb = NODES.find((n) => n.role === b)!;
            const active = recentlyActive.has(a) || recentlyActive.has(b);
            return (
              <line
                key={`${a}-${b}`}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                stroke="#00d4ff"
                strokeOpacity={active ? 0.85 : 0.18}
                strokeWidth={active ? 1.5 : 1}
                strokeDasharray="3 4"
                className={active ? 'animate-edge-pulse' : ''}
              />
            );
          })}

          {/* nodes */}
          {NODES.map((n) => {
            const health = status ? status[n.role] : undefined;
            const online = !!health?.online;
            return (
              <g key={n.role}>
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={32}
                  fill={online ? 'url(#atos-node-glow)' : 'url(#atos-node-glow-danger)'}
                />
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={14}
                  fill={online ? '#0a0a0f' : '#1a0a0e'}
                  stroke={online ? '#00d4ff' : '#ef4444'}
                  strokeWidth={1.5}
                />
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={4}
                  fill={online ? '#00d4ff' : '#ef4444'}
                />
                <text
                  x={n.x}
                  y={n.y + 32}
                  textAnchor="middle"
                  className="fill-operator-text"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '11px',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  {n.label}
                </text>
                <text
                  x={n.x}
                  y={n.y + 46}
                  textAnchor="middle"
                  className="fill-operator-muted"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9.5px',
                  }}
                >
                  {health?.status?.connectionCount ?? 0} peers
                </text>
              </g>
            );
          })}
        </svg>
        <p className="mt-2 text-[10.5px] text-operator-muted">
          edges pulse when the corresponding agent received a pubsub message in the last 3s.
        </p>
      </CardBody>
    </Card>
  );
}

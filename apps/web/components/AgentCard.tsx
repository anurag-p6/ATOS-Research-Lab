'use client';

import { useEffect, useState } from 'react';
import { Activity, ExternalLink, Radio } from 'lucide-react';
import type { AgentHealth, AgentRole } from '@/lib/agents';
import { Card, CardBody, CardHeader } from './ui/Card';
import { Badge } from './ui/Badge';
import { Mono } from './ui/Mono';
import { formatUptime, relativeTime } from '@/lib/format';

const ROLE_LABEL: Record<AgentRole, string> = {
  deployer: 'Deployer',
  monitor: 'Monitor',
  governance: 'Governance',
};

const ROLE_SUBTITLE: Record<AgentRole, string> = {
  deployer: 'contract deploys & upgrades',
  monitor: 'on-chain event watcher',
  governance: 'proposals & CEX metadata',
};

export function AgentCard({ health }: { health: AgentHealth | undefined }) {
  // Avoid hydration mismatch on `relativeTime` by deferring "now" until mount.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  if (!health) {
    return (
      <Card state="idle" className="p-4">
        <div className="atos-empty">awaiting agent status…</div>
      </Card>
    );
  }

  const { role, online, latencyMs, status, error, fetchedAt } = health;

  return (
    <Card
      state={online ? 'online' : 'offline'}
      className="atos-respect-reduced-motion overflow-hidden"
    >
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={
                online
                  ? 'atos-dot atos-dot-cyan animate-pulse-cyan'
                  : 'atos-dot atos-dot-danger'
              }
            />
            {ROLE_LABEL[role]}
          </span>
        }
        subtitle={ROLE_SUBTITLE[role]}
        right={
          <Badge tone={online ? 'cyan' : 'danger'}>
            {online ? (
              <>
                <Radio size={11} aria-hidden="true" />
                online
              </>
            ) : (
              <>
                <Radio size={11} aria-hidden="true" />
                offline
              </>
            )}
          </Badge>
        }
      />
        <CardBody className="space-y-2.5">
        <Row label="peerId">
          <Mono value={status?.peerId ?? null} head={8} tail={6} copy />
        </Row>
        <Row label="api">
          <span className="atos-numeric text-xs text-operator-text/85">
            :{status?.apiPort ?? '—'}
          </span>
          <span className="ml-3 text-[11px] text-operator-muted">tcp</span>
          <span className="atos-numeric ml-1 text-xs text-operator-text/85">
            :{status?.tcpPort ?? '—'}
          </span>
        </Row>
        <Row label="peers">
          <span className="atos-numeric text-xs text-operator-text/85">
            {status?.connectionCount ?? 0}
          </span>
          <Activity
            size={12}
            className="ml-1 inline-block text-operator-muted"
            aria-hidden="true"
          />
        </Row>
        <Row label="uptime">
          <span className="atos-numeric text-xs text-operator-text/85">
            {formatUptime(status?.uptimeSecs ?? 0)}
          </span>
        </Row>
        <Row label="heartbeat">
          <span className="atos-numeric text-xs text-operator-text/85">
            {now ? relativeTime(fetchedAt, now) : '—'}
          </span>
          {latencyMs != null ? (
            <span className="ml-2 text-[11px] text-operator-muted">
              {latencyMs}ms
            </span>
          ) : null}
        </Row>

        {/* PQC / ML-KEM-768 fingerprint */}
        {status?.kyberEkFingerprint ? (
          <Row label="kyber-ek">
            <Mono value={status.kyberEkFingerprint} head={8} tail={6} copy />
          </Row>
        ) : null}
        {status?.pqcStatus ? (
          <p className="atos-mono mt-0.5 break-all text-[10px] text-operator-muted/70">
            {status.pqcStatus}
          </p>
        ) : null}

        {!online && error ? (
          <p className="atos-mono mt-2 break-all rounded-sm border border-operator-danger/40 bg-operator-danger/5 p-2 text-[11px] text-operator-danger/90">
            {error}
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
          <span className="text-[11px] text-operator-muted">
            :{status?.apiPort ?? '—'}
          </span>
          <div className="flex items-center gap-2">
            <a
              href={`http://localhost:${status?.apiPort ?? ''}/ipld/state`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-operator-muted hover:text-operator-cyan"
              title="IPLD agent state node (CIDv1, dag-json)"
            >
              ipld <ExternalLink size={11} aria-hidden="true" />
            </a>
            <a
              href={`http://localhost:${status?.apiPort ?? ''}/status`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-operator-muted hover:text-operator-cyan"
            >
              status <ExternalLink size={11} aria-hidden="true" />
            </a>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] uppercase tracking-[0.18em] text-operator-muted">
        {label}
      </span>
      <span className="flex min-w-0 items-center text-right">{children}</span>
    </div>
  );
}

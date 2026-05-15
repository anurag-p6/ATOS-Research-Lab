'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { AlertTriangle, ServerOff } from 'lucide-react';
import { AgentCard } from '@/components/AgentCard';
import { TaskForm } from '@/components/TaskForm';
import { TaskFeed } from '@/components/TaskFeed';
import { NetworkGraph } from '@/components/NetworkGraph';
import { DexPriceWidget } from '@/components/DexPriceWidget';
import { CexPrepCard } from '@/components/CexPrepCard';
import { EventTicker } from '@/components/EventTicker';
import { WalletButton } from '@/components/WalletButton';
import { Badge } from '@/components/ui/Badge';
import { chainLabel } from '@/lib/chains';
import type { AgentsResponse } from '@/lib/types';

async function fetchAgents(signal: AbortSignal): Promise<AgentsResponse> {
  const res = await fetch('/api/agents', { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`agents ${res.status}`);
  return (await res.json()) as AgentsResponse;
}

export function DashboardClient() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace('/');
    }
  }, [ready, authenticated, router]);

  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: ({ signal }) => fetchAgents(signal),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    enabled: ready && authenticated,
  });

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="atos-mono text-sm text-operator-muted">
          {'> verifying operator session…'}
        </p>
      </div>
    );
  }

  const allOffline =
    agents.data != null &&
    !agents.data.deployer.online &&
    !agents.data.monitor.online &&
    !agents.data.governance.online;

  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 11155111;

  return (
    <div className="flex min-h-dvh flex-col pb-12">
      <TopBar chainId={chainId} />

      {allOffline ? (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-md border border-operator-amber/40 bg-operator-amber/5 px-3 py-2 text-[12px] text-operator-amber">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>
            All three agent APIs are unreachable. Verify the agent daemons are running on
            ports 3001 / 3002 / 3003. UI continues to render with offline state.
          </span>
        </div>
      ) : null}

      {agents.isError ? (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-md border border-operator-danger/40 bg-operator-danger/5 px-3 py-2 text-[12px] text-operator-danger">
          <ServerOff size={14} aria-hidden="true" />
          <span>/api/agents failed: {agents.error?.message}</span>
        </div>
      ) : null}

      <main className="flex-1 px-4 pt-3">
        <div className="grid grid-cols-12 gap-4">
          {/* Left rail: agents */}
          <aside className="col-span-12 space-y-3 lg:col-span-3">
            <h2 className="atos-heading mb-1 text-[11px] uppercase tracking-[0.22em] text-operator-muted">
              Agents
            </h2>
            <AgentCard health={agents.data?.deployer} />
            <AgentCard health={agents.data?.monitor} />
            <AgentCard health={agents.data?.governance} />
          </aside>

          {/* Center: task form + feed */}
          <section className="col-span-12 space-y-3 lg:col-span-6">
            <TaskForm />
            <TaskFeed />
          </section>

          {/* Right rail: network graph + dex + cex */}
          <aside className="col-span-12 space-y-3 lg:col-span-3">
            <NetworkGraph />
            <DexPriceWidget />
            <CexPrepCard />
          </aside>
        </div>
      </main>

      <EventTicker />
    </div>
  );
}

function TopBar({ chainId }: { chainId: number }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-bg/80 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="atos-dot atos-dot-cyan animate-pulse-cyan"
        />
        <h1 className="atos-heading text-sm uppercase tracking-[0.28em] text-operator-text">
          ATOS
        </h1>
        <span className="hidden text-[11px] text-operator-muted sm:inline">
          autonomous token orchestration
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone="cyan" title={`chain ${chainId}`}>
          {chainLabel(chainId)}
        </Badge>
        <WalletButton />
      </div>
    </header>
  );
}

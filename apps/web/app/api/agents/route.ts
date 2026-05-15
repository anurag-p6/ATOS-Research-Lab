import { NextResponse } from 'next/server';
import { AGENT_ROLES, fetchAgentStatus, type AgentHealth, type AgentRole } from '@/lib/agents';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const settled = await Promise.all(AGENT_ROLES.map((role) => fetchAgentStatus(role)));

  const byRole = settled.reduce<Record<AgentRole, AgentHealth>>(
    (acc, h) => {
      acc[h.role] = h;
      return acc;
    },
    {} as Record<AgentRole, AgentHealth>,
  );

  return NextResponse.json(
    {
      fetchedAt: Date.now(),
      deployer: byRole.deployer,
      monitor: byRole.monitor,
      governance: byRole.governance,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

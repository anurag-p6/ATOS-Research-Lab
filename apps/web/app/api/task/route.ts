import { NextResponse } from 'next/server';
import {
  AGENT_ROLES,
  submitAgentTask,
  type AgentRole,
} from '@/lib/agents';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface TaskRequestBody {
  agent: AgentRole;
  action: string;
  payload?: Record<string, unknown>;
  contractAddress?: string;
  chainId?: number;
}

function isAgentRole(v: unknown): v is AgentRole {
  return typeof v === 'string' && (AGENT_ROLES as string[]).includes(v);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'expected object body' }, { status: 400 });
  }
  const b = body as Partial<TaskRequestBody>;
  if (!isAgentRole(b.agent)) {
    return NextResponse.json({ error: 'agent must be deployer | monitor | governance' }, { status: 400 });
  }
  if (typeof b.action !== 'string' || b.action.trim().length === 0) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 });
  }

  const forwardPayload: Record<string, unknown> = {
    action: b.action,
    contractAddress: b.contractAddress,
    chainId: b.chainId,
    ...(b.payload ?? {}),
    submittedAt: Date.now(),
  };

  const result = await submitAgentTask(b.agent, forwardPayload);

  return NextResponse.json(
    {
      ok: result.ok,
      agent: b.agent,
      action: b.action,
      response: result.body,
    },
    {
      status: result.status,
      headers: { 'cache-control': 'no-store' },
    },
  );
}

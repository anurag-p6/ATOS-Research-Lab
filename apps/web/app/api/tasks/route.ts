import { NextResponse } from 'next/server';
import {
  AGENT_ROLES,
  fetchAgentTasks,
  type TaggedTask,
} from '@/lib/agents';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const results = await Promise.all(
    AGENT_ROLES.map(async (role) => ({ role, tasks: await fetchAgentTasks(role) })),
  );

  const flat: TaggedTask[] = results.flatMap(({ role, tasks }) =>
    tasks.map((t) => ({ ...t, origin: role })),
  );

  flat.sort((a, b) => b.timestamp - a.timestamp);

  return NextResponse.json(
    { total: flat.length, fetchedAt: Date.now(), tasks: flat },
    { headers: { 'cache-control': 'no-store' } },
  );
}

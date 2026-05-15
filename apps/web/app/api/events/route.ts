import { NextResponse } from 'next/server';
import {
  AGENT_ROLES,
  fetchAgentEvents,
  type TaggedEvent,
} from '@/lib/agents';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const results = await Promise.all(
    AGENT_ROLES.map(async (role) => ({ role, events: await fetchAgentEvents(role) })),
  );

  const flat: TaggedEvent[] = results.flatMap(({ role, events }) =>
    events.map((e) => ({ ...e, origin: role })),
  );

  flat.sort((a, b) => b.timestamp - a.timestamp);

  return NextResponse.json(
    { total: flat.length, fetchedAt: Date.now(), events: flat },
    { headers: { 'cache-control': 'no-store' } },
  );
}

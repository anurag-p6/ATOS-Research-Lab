import { NextResponse } from 'next/server';
import { fetchDexPoolSnapshot } from '@/lib/dex-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const snapshot = await fetchDexPoolSnapshot();
  return NextResponse.json(snapshot, { headers: { 'cache-control': 'no-store' } });
}

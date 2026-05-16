import { NextResponse } from 'next/server';
import { submitAgentTask } from '@/lib/agents';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface LiquidityTaskBody {
  contractAddress: string;
  chainId: number;
  atosAmount: string;
  wethAmount: string;
  fee?: number;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const b = body as Partial<LiquidityTaskBody>;
  if (!b.contractAddress || !b.atosAmount || !b.wethAmount) {
    return NextResponse.json(
      { error: 'contractAddress, atosAmount, wethAmount required' },
      { status: 400 },
    );
  }

  const payload = {
    action: 'seed_uniswap_v3_pool',
    contractAddress: b.contractAddress,
    chainId: b.chainId ?? 11155111,
    atosAmount: b.atosAmount,
    wethAmount: b.wethAmount,
    fee: b.fee ?? 3000,
    note: 'Operator queued Uniswap V3 pool create + mint via deployer agent (PoC: logged + gossipsub; run forge script for on-chain execution)',
    submittedAt: Date.now(),
  };

  const result = await submitAgentTask('deployer', payload);

  return NextResponse.json(
    { ok: result.ok, agent: 'deployer', payload, response: result.body },
    { status: result.status, headers: { 'cache-control': 'no-store' } },
  );
}

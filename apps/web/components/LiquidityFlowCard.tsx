'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseEther, type Address } from 'viem';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Droplets,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { sepolia } from '@/lib/chains';
import type { DexPoolSnapshot } from '@/lib/dex-server';
import {
  ERC20_ABI,
  mapAmountsToToken0Token1,
  NPM_ABI,
  sortTokenPair,
  UNISWAP_V3_SEPOLIA,
  WETH_ABI,
  etherscanAddressUrl,
} from '@/lib/uniswap';
import { useDexPool } from '@/hooks/useDexPool';
import { Card, CardBody, CardHeader } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Mono } from './ui/Mono';

type StepId = 'wrap' | 'approveAtos' | 'approveWeth' | 'createPool' | 'mint' | 'done';

const STEP_LABELS: Record<StepId, string> = {
  wrap: 'Wrap ETH → WETH',
  approveAtos: 'Approve ATOS',
  approveWeth: 'Approve WETH',
  createPool: 'Create / init pool',
  mint: 'Mint LP position',
  done: 'Complete',
};

export function LiquidityFlowCard() {
  const poolQuery = useDexPool();
  const queryClient = useQueryClient();
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [atosHuman, setAtosHuman] = useState('1000');
  const [wethHuman, setWethHuman] = useState('0.005');
  const [activeStep, setActiveStep] = useState<StepId | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);

  const { isLoading: txPending } = useWaitForTransactionReceipt({ hash: txHash });

  const atos = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address | undefined;
  const onSepolia = chainId === sepolia.id;
  const snapshot = poolQuery.data && !poolQuery.data.mocked ? poolQuery.data : null;

  const queueTask = useMutation({
    mutationFn: async () => {
      if (!atos) throw new Error('ATOS address not configured');
      const res = await fetch('/api/dex/liquidity/task', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contractAddress: atos,
          chainId: sepolia.id,
          atosAmount: parseEther(atosHuman || '0').toString(),
          wethAmount: parseEther(wethHuman || '0').toString(),
          fee: 3000,
        }),
      });
      const json = (await res.json()) as { ok: boolean };
      if (!res.ok || !json.ok) throw new Error('task queue failed');
      return json;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['dex-pool'] });
    },
  });

  const runSeed = useCallback(async () => {
    if (!address || !atos || !onSepolia) return;
    setError(null);

    const atosAmount = parseEther(atosHuman || '0');
    const wethAmount = parseEther(wethHuman || '0');
    const { npm, weth, sqrtPriceX96, tickLower, tickUpper } = UNISWAP_V3_SEPOLIA;
    const fee = 3000;
    const { token0, token1, atosIsToken0 } = sortTokenPair(atos, weth);
    const { amount0Desired, amount1Desired } = mapAmountsToToken0Token1(
      atosIsToken0,
      atosAmount,
      wethAmount,
    );

    try {
      setActiveStep('wrap');
      const wethBal = await readBalance(weth, address);
      if (wethBal < wethAmount) {
        const wrapHash = await writeContractAsync({
          address: weth,
          abi: WETH_ABI,
          functionName: 'deposit',
          value: wethAmount - wethBal,
          chainId: sepolia.id,
        });
        setTxHash(wrapHash);
        await waitTx(wrapHash);
      }

      setActiveStep('approveAtos');
      let hash = await writeContractAsync({
        address: atos,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [npm, atosAmount],
        chainId: sepolia.id,
      });
      setTxHash(hash);
      await waitTx(hash);

      setActiveStep('approveWeth');
      hash = await writeContractAsync({
        address: weth,
        abi: WETH_ABI,
        functionName: 'approve',
        args: [npm, wethAmount],
        chainId: sepolia.id,
      });
      setTxHash(hash);
      await waitTx(hash);

      setActiveStep('createPool');
      hash = await writeContractAsync({
        address: npm,
        abi: NPM_ABI,
        functionName: 'createAndInitializePoolIfNecessary',
        args: [token0, token1, fee, sqrtPriceX96],
        chainId: sepolia.id,
      });
      setTxHash(hash);
      await waitTx(hash);

      setActiveStep('mint');
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
      hash = await writeContractAsync({
        address: npm,
        abi: NPM_ABI,
        functionName: 'mint',
        args: [
          {
            token0,
            token1,
            fee,
            tickLower,
            tickUpper,
            amount0Desired,
            amount1Desired,
            amount0Min: 0n,
            amount1Min: 0n,
            recipient: address,
            deadline,
          },
        ],
        chainId: sepolia.id,
      });
      setTxHash(hash);
      await waitTx(hash);

      setActiveStep('done');
      void poolQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ['dex-price'] });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'transaction failed');
      setActiveStep(null);
    }
  }, [
    address,
    atos,
    atosHuman,
    onSepolia,
    poolQuery,
    queryClient,
    wethHuman,
    writeContractAsync,
  ]);

  const statusBadge = useMemo(() => {
    if (poolQuery.data?.mocked) {
      return <Badge tone="amber">setup required</Badge>;
    }
    if (!snapshot?.pool) {
      return <Badge tone="amber">not listed</Badge>;
    }
    if (!snapshot.listed) {
      return <Badge tone="amber">pool empty</Badge>;
    }
    return <Badge tone="cyan">listed</Badge>;
  }, [poolQuery.data, snapshot]);

  return (
    <Card state="idle">
      <CardHeader
        title="DEX liquidity"
        subtitle="Uniswap V3 ATOS / WETH on Sepolia"
        right={statusBadge}
      />
      <CardBody className="space-y-4">
        <PoolStatus snapshot={snapshot} mocked={poolQuery.data?.mocked} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="atos-label" htmlFor="atos-liq">
              ATOS amount
            </label>
            <input
              id="atos-liq"
              className="atos-input atos-numeric"
              value={atosHuman}
              onChange={(e) => setAtosHuman(e.target.value)}
            />
          </div>
          <div>
            <label className="atos-label" htmlFor="weth-liq">
              WETH amount
            </label>
            <input
              id="weth-liq"
              className="atos-input atos-numeric"
              value={wethHuman}
              onChange={(e) => setWethHuman(e.target.value)}
            />
          </div>
        </div>

        <p className="text-[11px] text-operator-muted">
          Fee tier: 0.30% (3000) · full-range LP · matches{' '}
          <span className="atos-mono">SeedUniswapV3PoolSepolia.s.sol</span>
        </p>

        {activeStep ? (
          <p className="atos-mono text-[11px] text-operator-cyan">
            {txPending ? (
              <Loader2 size={12} className="mr-1 inline animate-spin" aria-hidden="true" />
            ) : null}
            step: {STEP_LABELS[activeStep]}
            {txHash ? ` · tx ${txHash.slice(0, 10)}…` : ''}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-md border border-operator-danger/40 bg-operator-danger/5 p-2 text-[11px] text-operator-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={!isConnected || !onSepolia || !atos || txPending}
            leading={<Droplets size={14} aria-hidden="true" />}
            onClick={() => void runSeed()}
          >
            {txPending ? 'confirm in wallet…' : 'List + seed liquidity'}
          </Button>
          <Button
            variant="secondary"
            disabled={!atos || queueTask.isPending}
            onClick={() => void queueTask.mutate()}
          >
            Queue deployer task
          </Button>
        </div>

        {!onSepolia && isConnected ? (
          <p className="text-[11px] text-operator-amber">
            Switch wallet to Sepolia (11155111) to sign liquidity transactions.
          </p>
        ) : null}

        {!isConnected ? (
          <p className="text-[11px] text-operator-muted">
            Connect wallet to create pool and mint LP on-chain.
          </p>
        ) : null}

        {queueTask.isSuccess ? (
          <p className="flex items-center gap-1 text-[11px] text-operator-success">
            <CheckCircle2 size={12} aria-hidden="true" />
            Deployer task queued — check task feed. Run forge script for guaranteed on-chain LP.
          </p>
        ) : null}

        <ForgeHint />
      </CardBody>
    </Card>
  );
}

function PoolStatus({
  snapshot,
  mocked,
}: {
  snapshot: DexPoolSnapshot | null;
  mocked: boolean | undefined;
}) {
  if (mocked) {
    return (
      <div className="atos-empty text-left">
        {`> pool: not configured`}
        <br />
        {`> set NEXT_PUBLIC_CONTRACT_ADDRESS + NEXT_PUBLIC_ETH_RPC_URL`}
      </div>
    );
  }

  if (!snapshot) {
    return <div className="atos-empty">loading pool state…</div>;
  }

  if (!snapshot.pool) {
    return (
      <div className="rounded-md border border-operator-amber/30 bg-operator-amber/5 p-3 text-[11px] text-operator-muted">
        <AlertTriangle size={12} className="mr-1 inline text-operator-amber" />
        No V3 pool yet for ATOS/WETH at fee {snapshot.fee}. Use the button below to
        create the pool and deposit liquidity in one flow.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-line bg-bg-sunken/50 p-3 text-[11px]">
      <div className="flex justify-between gap-2">
        <span className="text-operator-muted">pool</span>
        <Mono value={snapshot.pool} head={8} tail={6} copy />
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-operator-muted">liquidity</span>
        <span className="atos-numeric text-operator-text">{snapshot.liquidity}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-operator-muted">price (WETH / ATOS)</span>
        <span className="atos-numeric text-operator-text">
          {snapshot.priceWethPerAtos.toFixed(8)}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        {snapshot.uniswapUrl ? (
          <a
            href={snapshot.uniswapUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-operator-cyan hover:underline"
          >
            Open on Uniswap <ExternalLink size={11} aria-hidden="true" />
          </a>
        ) : null}
        <a
          href={etherscanAddressUrl(snapshot.pool, snapshot.chainId)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-operator-muted hover:text-operator-cyan"
        >
          Etherscan <ExternalLink size={11} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

function ForgeHint() {
  return (
    <details className="rounded-md border border-line bg-bg-sunken/40 p-2 text-[11px] text-operator-muted">
      <summary className="cursor-pointer text-operator-text">CLI alternative (Foundry)</summary>
      <pre className="atos-mono mt-2 overflow-x-auto whitespace-pre-wrap text-[10px] leading-relaxed">
        {`cd contracts
# .env: ATOS_SEPOLIA=0x...
./script/uniswap/seed-pool-sepolia.sh

# Then set in apps/web/.env:
# NEXT_PUBLIC_DEX_POOL_ADDRESS=0x<Pool from script output>`}
      </pre>
    </details>
  );
}

async function readBalance(token: Address, owner: Address): Promise<bigint> {
  const { createPublicClient, http } = await import('viem');
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.NEXT_PUBLIC_ETH_RPC_URL),
  });
  return client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [owner],
  });
}

async function waitTx(hash: `0x${string}`) {
  const { createPublicClient, http } = await import('viem');
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.NEXT_PUBLIC_ETH_RPC_URL),
  });
  await client.waitForTransactionReceipt({ hash });
}

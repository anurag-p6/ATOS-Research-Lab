'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { decodeEventLog, parseEther } from 'viem';
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  Coins,
  ExternalLink,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { filecoinCalibration, sepolia } from '@/lib/chains';
import {
  DEFAULT_CAP_HUMAN,
  DEFAULT_INITIAL_HUMAN,
  factoryAddress,
  suggestSymbol,
  TOKEN_FACTORY_ABI,
} from '@/lib/token-factory';
import { copyToClipboard } from '@/lib/format';
import { Card, CardBody, CardHeader } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Mono } from './ui/Mono';

// ---------------------------------------------------------------------------
// Chain config
// ---------------------------------------------------------------------------

const SUPPORTED_CHAINS = [
  {
    chain: sepolia,
    label: 'Sepolia',
    explorerName: 'Etherscan',
    addressUrl: (a: string) => `https://sepolia.etherscan.io/address/${a}`,
    txUrl: (h: string) => `https://sepolia.etherscan.io/tx/${h}`,
  },
  {
    chain: filecoinCalibration,
    label: 'Calibration',
    explorerName: 'Blockscout',
    addressUrl: (a: string) => `https://filecoin-testnet.blockscout.com/address/${a}`,
    txUrl: (h: string) => `https://filecoin-testnet.blockscout.com/tx/${h}`,
  },
] as const;

// ---------------------------------------------------------------------------
// Progress dots — extracted to avoid TypeScript narrowing conflicts with
// the parent's `isBusy || step === 'success'` conditional expression.
// ---------------------------------------------------------------------------

const DOT_STEPS: Step[] = ['switching', 'submitting', 'confirming', 'success'];

function ProgressDots({ step }: { step: Step }) {
  const currentIdx = DOT_STEPS.indexOf(step);
  return (
    <div className="flex items-center gap-0">
      {DOT_STEPS.map((s, i) => {
        const thisIdx = DOT_STEPS.indexOf(s);
        const allDone = step === 'success';
        const done = allDone || thisIdx < currentIdx;
        const active = s === step;
        return (
          <div key={s} className="flex flex-1 items-center">
            <div
              className={[
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold transition-all',
                done
                  ? 'bg-operator-success text-bg'
                  : active
                    ? 'bg-operator-cyan text-bg'
                    : 'bg-line text-operator-muted',
              ].join(' ')}
            >
              {done ? '✓' : i + 1}
            </div>
            {i < DOT_STEPS.length - 1 && (
              <div
                className={[
                  'h-px flex-1 transition-all',
                  done ? 'bg-operator-success' : 'bg-line',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step state machine
//   idle → switching → submitting → confirming → success
//   any step can go → error → idle (reset)
// ---------------------------------------------------------------------------

type Step = 'idle' | 'switching' | 'submitting' | 'confirming' | 'success' | 'error';

const STEP_LABEL: Record<Step, string> = {
  idle:       'Deploy Token',
  switching:  'Switching network…',
  submitting: 'Awaiting Privy signature…',
  confirming: 'Confirming on-chain…',
  success:    'Deployed',
  error:      'Retry Deploy',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TokenFactoryCard() {
  // ── wallet state ──────────────────────────────────────────────────────────
  const currentChainId = useChainId();
  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();

  // ── which chain the user wants to deploy on ───────────────────────────────
  const [targetChainIdx, setTargetChainIdx] = useState(0);
  const chainInfo = SUPPORTED_CHAINS[targetChainIdx] ?? SUPPORTED_CHAINS[0]!;
  const targetChainId = chainInfo.chain.id;
  const factory = factoryAddress(targetChainId);

  // ── form fields ───────────────────────────────────────────────────────────
  const [name, setName] = useState('My ATOS Token');
  const [symbol, setSymbol] = useState('');
  const [symbolTouched, setSymbolTouched] = useState(false);
  const [capHuman, setCapHuman] = useState(DEFAULT_CAP_HUMAN);
  const [initialHuman, setInitialHuman] = useState(DEFAULT_INITIAL_HUMAN);

  // auto-suggest symbol while user types name
  useEffect(() => {
    if (!symbolTouched && name.trim()) setSymbol(suggestSymbol(name));
  }, [name, symbolTouched]);

  // ── deploy state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [deployedToken, setDeployedToken] = useState<`0x${string}` | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ── wait for receipt ──────────────────────────────────────────────────────
  const { data: receipt } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!receipt || !factory || step !== 'confirming') return;

    let found: `0x${string}` | null = null;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== factory.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: TOKEN_FACTORY_ABI,
          eventName: 'TokenCreated',
          data: log.data,
          topics: log.topics,
        });
        found = (decoded.args as unknown as { token: `0x${string}` }).token;
        break;
      } catch {
        // not the TokenCreated log, skip
      }
    }
    setDeployedToken(found);
    setStep('success');
  }, [receipt, factory, step]);

  // ── derived ───────────────────────────────────────────────────────────────
  const capWei = useMemo(() => {
    try { return parseEther(capHuman || '0'); } catch { return 0n; }
  }, [capHuman]);

  const initialWei = useMemo(() => {
    try { return parseEther(initialHuman || '0'); } catch { return 0n; }
  }, [initialHuman]);

  const needsSwitch = isConnected && currentChainId !== targetChainId;
  const isBusy = step === 'switching' || step === 'submitting' || step === 'confirming';
  const formDisabled = isBusy || step === 'success';

  const canDeploy =
    !!factory &&
    isConnected &&
    !isBusy &&
    step !== 'success' &&
    name.trim().length > 0 &&
    symbol.trim().length > 0;

  // ── handlers ──────────────────────────────────────────────────────────────
  async function onDeploy() {
    if (!factory || !canDeploy) return;
    setErrorMsg(null);

    if (initialWei > capWei) {
      setErrorMsg('Initial supply cannot exceed cap.');
      setStep('error');
      return;
    }

    try {
      if (needsSwitch) {
        setStep('switching');
        await switchChainAsync({ chainId: targetChainId });
      }

      setStep('submitting');
      const hash = await writeContractAsync({
        address: factory,
        abi: TOKEN_FACTORY_ABI,
        functionName: 'createToken',
        args: [name.trim(), symbol.trim().toUpperCase(), capWei, initialWei],
        chainId: targetChainId,
      });
      setTxHash(hash);
      setStep('confirming');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // user-rejected shows as a long SDK error — simplify it
      setErrorMsg(
        msg.includes('rejected') || msg.includes('denied')
          ? 'Transaction rejected by user.'
          : msg,
      );
      setStep('error');
    }
  }

  function reset() {
    setStep('idle');
    setTxHash(undefined);
    setDeployedToken(null);
    setErrorMsg(null);
    setCopied(false);
  }

  async function copyAddress() {
    if (!deployedToken) return;
    await copyToClipboard(deployedToken);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <Card state="idle">
      <CardHeader
        title="Token Deployer Agent"
        subtitle="Privy wallet signs — no Foundry required"
        right={
          factory
            ? <Badge tone="cyan">ready · {chainInfo.label}</Badge>
            : <Badge tone="amber">not configured</Badge>
        }
      />

      <CardBody className="space-y-4">

        {/* ── Chain selector ─────────────────────────────────────────────── */}
        <div>
          <p className="atos-label mb-1">Target network</p>
          <div className="flex gap-2">
            {SUPPORTED_CHAINS.map((c, i) => {
              const hasFact = !!factoryAddress(c.chain.id);
              const active = i === targetChainIdx;
              return (
                <button
                  key={c.chain.id}
                  type="button"
                  disabled={formDisabled}
                  onClick={() => { setTargetChainIdx(i); reset(); }}
                  className={[
                    'flex flex-1 items-center justify-center gap-1.5 rounded border px-3 py-2',
                    'text-[12px] font-medium transition-all duration-150',
                    active
                      ? 'border-operator-cyan bg-operator-cyan/10 text-operator-cyan'
                      : 'border-line text-operator-muted hover:border-operator-text hover:text-operator-text',
                    formDisabled ? 'cursor-not-allowed opacity-60' : '',
                  ].join(' ')}
                >
                  {/* live dot */}
                  <span
                    className={[
                      'h-1.5 w-1.5 rounded-full',
                      hasFact ? 'bg-operator-success' : 'bg-operator-amber',
                    ].join(' ')}
                    title={hasFact ? 'factory deployed' : 'factory address not set'}
                    aria-hidden="true"
                  />
                  {c.label}
                  {!hasFact && (
                    <span className="text-[9px] text-operator-amber">(!)</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* network switch notice */}
          {needsSwitch && step === 'idle' && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-operator-amber">
              <ArrowRightLeft size={10} aria-hidden="true" />
              Wallet is on a different network. Clicking Deploy will switch automatically.
            </p>
          )}
        </div>

        {/* ── Factory not configured ─────────────────────────────────────── */}
        {!factory ? (
          <div className="rounded border border-operator-amber/30 bg-operator-amber/5 px-3 py-2.5 text-[11px] text-operator-amber">
            <p className="font-medium">Factory not configured for {chainInfo.label}</p>
            <p className="mt-1 text-operator-muted">
              Set{' '}
              <span className="atos-mono">
                NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS_{chainInfo.label.toUpperCase()}
              </span>{' '}
              in <span className="atos-mono">apps/web/.env</span>
            </p>
            <p className="mt-0.5 text-operator-muted">
              Then deploy:{' '}
              <span className="atos-mono">
                contracts/script/deploy-factory-{chainInfo.label.toLowerCase()}.sh
              </span>
            </p>
          </div>
        ) : (
          <>
            {/* ── Form fields ──────────────────────────────────────────────── */}
            <div>
              <label className="atos-label" htmlFor="tf-name">
                Token name
              </label>
              <input
                id="tf-name"
                className="atos-input"
                value={name}
                disabled={formDisabled}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Research Token"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="atos-label" htmlFor="tf-symbol">
                  Symbol
                </label>
                <input
                  id="tf-symbol"
                  className="atos-input atos-mono uppercase"
                  value={symbol}
                  disabled={formDisabled}
                  maxLength={16}
                  onChange={(e) => {
                    setSymbolTouched(true);
                    setSymbol(e.target.value.toUpperCase());
                  }}
                  placeholder="ACME"
                />
              </div>
              <div>
                <label className="atos-label" htmlFor="tf-initial">
                  Initial supply
                </label>
                <input
                  id="tf-initial"
                  className="atos-input atos-numeric"
                  value={initialHuman}
                  disabled={formDisabled}
                  onChange={(e) => setInitialHuman(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="atos-label" htmlFor="tf-cap">
                Max supply (cap)
              </label>
              <input
                id="tf-cap"
                className="atos-input atos-numeric"
                value={capHuman}
                disabled={formDisabled}
                onChange={(e) => setCapHuman(e.target.value)}
              />
            </div>

            <p className="text-[11px] text-operator-muted">
              You become the owner and receive the initial supply. Gas is paid from your
              connected wallet on {chainInfo.label}.
            </p>

            {/* ── Step progress indicator ──────────────────────────────────── */}
            {isBusy && (
              <div className="flex items-center gap-2 rounded border border-operator-cyan/30 bg-operator-cyan/5 px-3 py-2.5 text-[11px] text-operator-cyan">
                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                <span>
                  {step === 'switching' && 'Switching to ' + chainInfo.label + '…'}
                  {step === 'submitting' && 'Waiting for Privy signature…'}
                  {step === 'confirming' && (
                    <>
                      Confirming on-chain&nbsp;
                      {txHash && (
                        <a
                          href={chainInfo.txUrl(txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline opacity-80 hover:opacity-100"
                        >
                          view tx ↗
                        </a>
                      )}
                    </>
                  )}
                </span>
              </div>
            )}

            {/* ── Step progress dots ───────────────────────────────────────── */}
            {(isBusy || step === 'success') && (
              <ProgressDots step={step} />
            )}


            {/* ── Error ───────────────────────────────────────────────────── */}
            {step === 'error' && errorMsg && (
              <div className="flex items-start gap-2 rounded border border-operator-danger/40 bg-operator-danger/5 px-3 py-2.5 text-[11px] text-operator-danger">
                <AlertCircle size={13} className="mt-px shrink-0" aria-hidden="true" />
                <span className="break-all">{errorMsg}</span>
              </div>
            )}

            {/* ── Deploy / Retry button ────────────────────────────────────── */}
            {step !== 'success' && (
              <>
                <Button
                  variant="primary"
                  disabled={!canDeploy}
                  leading={
                    step === 'error'
                      ? <RotateCcw size={14} aria-hidden="true" />
                      : <Coins size={14} aria-hidden="true" />
                  }
                  onClick={() => void onDeploy()}
                  className="w-full justify-center"
                >
                  {needsSwitch && step === 'idle'
                    ? `Switch to ${chainInfo.label} & Deploy`
                    : STEP_LABEL[step === 'idle' || step === 'error' ? step : 'idle']}
                </Button>

                {!isConnected && (
                  <p className="text-center text-[11px] text-operator-amber">
                    Connect your wallet to deploy.
                  </p>
                )}
              </>
            )}

            {/* ── Success result ───────────────────────────────────────────── */}
            {step === 'success' && (
              <div className="space-y-3 rounded border border-operator-success/40 bg-operator-success/5 p-3 text-[11px]">
                <div className="flex items-center gap-1.5 font-medium text-operator-success">
                  <CheckCircle2 size={13} aria-hidden="true" />
                  Token deployed on {chainInfo.label}
                </div>

                {deployedToken ? (
                  <div className="space-y-1">
                    <p className="text-operator-muted">Contract address:</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Mono value={deployedToken} head={12} tail={8} copy />
                      <button
                        type="button"
                        className="atos-btn atos-btn-ghost py-0.5 text-[10px]"
                        onClick={() => void copyAddress()}
                      >
                        {copied ? '✓ copied' : 'copy full'}
                      </button>
                      <a
                        href={chainInfo.addressUrl(deployedToken)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-operator-cyan hover:underline"
                      >
                        {chainInfo.explorerName} <ExternalLink size={10} aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                ) : null}

                {txHash ? (
                  <div className="space-y-1">
                    <p className="text-operator-muted">Transaction:</p>
                    <a
                      href={chainInfo.txUrl(txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="atos-mono inline-flex items-center gap-0.5 text-operator-cyan hover:underline"
                    >
                      <Mono value={txHash} head={10} tail={8} />
                      <ExternalLink size={10} aria-hidden="true" />
                    </a>
                  </div>
                ) : null}

                <p className="text-operator-muted">
                  Paste the contract address into the task form to monitor events or add
                  DEX liquidity.
                </p>

                <Button
                  variant="ghost"
                  leading={<RotateCcw size={12} aria-hidden="true" />}
                  onClick={reset}
                  className="w-full justify-center text-[11px]"
                >
                  Deploy another token
                </Button>
              </div>
            )}

            {/* ── Footer: factory address ──────────────────────────────────── */}
            <div className="border-t border-line pt-2">
              <p className="text-[10px] text-operator-muted">
                Factory ({chainInfo.label}):{' '}
                <Mono value={factory} head={10} tail={6} />
              </p>
            </div>
          </>
        )}

      </CardBody>
    </Card>
  );
}

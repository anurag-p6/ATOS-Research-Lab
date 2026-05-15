'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { LogIn, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();

  useEffect(() => {
    if (ready && authenticated) {
      router.replace('/dashboard');
    }
  }, [ready, authenticated, router]);

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-6">
      <div className="atos-card atos-respect-reduced-motion atos-shadow-glow w-full max-w-md p-8">
        <header className="mb-6 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="atos-dot atos-dot-cyan animate-pulse-cyan"
          />
          <h1 className="atos-heading text-lg uppercase tracking-[0.28em] text-operator-text">
            ATOS Console
          </h1>
        </header>

        <p className="atos-mono mb-6 text-[11.5px] leading-relaxed text-operator-muted">
          {'> autonomous_token_orchestration_system'}
          <br />
          {'> chains: sepolia · filecoin-calibration'}
          <br />
          {'> agents: deployer · monitor · governance'}
          <br />
          {'>'}
          <span className="animate-flicker">_</span>
        </p>

        <div className="space-y-3">
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => login()}
            leading={<LogIn size={14} aria-hidden="true" />}
            className="w-full justify-center py-2.5"
          >
            {ready ? 'Connect operator' : '…initializing'}
          </Button>
          <p className="text-center text-[11px] text-operator-muted">
            Email or wallet · Privy MPC embedded wallet auto-created for users without one.
          </p>
        </div>

        <footer className="mt-8 flex items-center justify-between border-t border-line pt-4 text-[11px] text-operator-muted">
          <span className="inline-flex items-center gap-1.5">
            <Terminal size={12} aria-hidden="true" />
            research PoC
          </span>
          <span className="atos-mono">v0.1.0</span>
        </footer>
      </div>
    </main>
  );
}

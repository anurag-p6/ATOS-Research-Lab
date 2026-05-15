'use client';

import { useRouter } from 'next/navigation';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { LogIn, LogOut, Wallet } from 'lucide-react';
import { Button } from './ui/Button';
import { CopyButton } from './ui/CopyButton';
import { truncateMiddle } from '@/lib/format';

export function WalletButton() {
  const router = useRouter();
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

  if (!ready) {
    return (
      <Button variant="secondary" disabled aria-busy="true">
        <span className="atos-mono text-xs text-operator-muted">…initializing</span>
      </Button>
    );
  }

  if (!authenticated) {
    return (
      <Button
        variant="primary"
        leading={<LogIn size={14} aria-hidden="true" />}
        onClick={() =>
          login({
            // both methods enabled in PrivyProvider config; this matches whatever the user picks
          })
        }
      >
        Login
      </Button>
    );
  }

  const primary = wallets[0];
  const address =
    primary?.address ?? user?.wallet?.address ?? null;

  return (
    <div className="flex items-center gap-2">
      <div className="atos-card flex items-center gap-2 rounded-md px-2.5 py-1.5">
        <Wallet size={14} className="text-operator-cyan" aria-hidden="true" />
        <span className="atos-mono text-xs text-operator-text" title={address ?? undefined}>
          {address ? truncateMiddle(address, 6, 4) : 'no wallet'}
        </span>
        {address ? <CopyButton value={address} label="Copy address" /> : null}
      </div>
      <Button
        variant="ghost"
        leading={<LogOut size={14} aria-hidden="true" />}
        onClick={async () => {
          await logout();
          router.replace('/');
        }}
      >
        Disconnect
      </Button>
    </div>
  );
}

import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import '@/lib/fonts.css';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'ATOS — Autonomous Token Orchestration',
  description:
    'Operator console for the ATOS multi-agent ERC-20 lifecycle system (Sepolia + Filecoin Calibration).',
  applicationName: 'ATOS',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-dvh bg-bg text-operator-text antialiased selection:bg-operator-cyan/20 selection:text-operator-cyan">
        <div className="atos-grid-overlay pointer-events-none fixed inset-0 -z-10" />
        <div className="atos-vignette pointer-events-none fixed inset-0 -z-10" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

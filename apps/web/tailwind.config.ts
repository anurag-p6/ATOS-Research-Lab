import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0a0f',
          raised: '#0e0e14',
          sunken: '#070709',
        },
        line: 'rgba(255,255,255,0.06)',
        operator: {
          cyan: '#00d4ff',
          'cyan-dim': 'rgba(0,212,255,0.18)',
          amber: '#f59e0b',
          danger: '#ef4444',
          success: '#10b981',
          muted: '#9aa0a6',
          text: '#e6e8eb',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular'],
        numeric: ['var(--font-numeric)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'glow-cyan': '0 0 0 1px rgba(0,212,255,0.18), 0 0 24px rgba(0,212,255,0.12)',
        'glow-cyan-strong':
          '0 0 0 1px rgba(0,212,255,0.4), 0 0 32px rgba(0,212,255,0.25), inset 0 0 24px rgba(0,212,255,0.05)',
        'glow-danger':
          '0 0 0 1px rgba(239,68,68,0.45), 0 0 28px rgba(239,68,68,0.18), inset 0 0 18px rgba(239,68,68,0.05)',
        'inset-soft': 'inset 0 1px 0 rgba(255,255,255,0.03), inset 0 0 24px rgba(255,255,255,0.015)',
      },
      keyframes: {
        'pulse-cyan': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0,212,255,0.45)' },
          '50%': { boxShadow: '0 0 0 6px rgba(0,212,255,0)' },
        },
        'edge-pulse': {
          '0%': { strokeOpacity: '0.2', strokeWidth: '1' },
          '50%': { strokeOpacity: '1', strokeWidth: '2' },
          '100%': { strokeOpacity: '0.2', strokeWidth: '1' },
        },
        ticker: {
          from: { transform: 'translateX(0%)' },
          to: { transform: 'translateX(-50%)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      animation: {
        'pulse-cyan': 'pulse-cyan 1.2s ease-out infinite',
        'edge-pulse': 'edge-pulse 1.6s ease-in-out infinite',
        ticker: 'ticker 40s linear infinite',
        flicker: 'flicker 2s ease-in-out infinite',
      },
    },
  },
  plugins: [forms, typography],
};

export default config;

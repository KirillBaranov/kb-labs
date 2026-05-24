import path from 'path';
import { fileURLToPath } from 'url';
import type { Config } from 'tailwindcss';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    path.join(__dirname, '../../packages/site-ui/src/**/*.{ts,tsx}'),
  ],
  corePlugins: {
    preflight: true,
  },
  theme: {
    extend: {
      colors: {
        /* KB Labs semantic tokens */
        bg:           'rgb(var(--color-bg) / <alpha-value>)',
        surface:      'rgb(var(--color-surface) / <alpha-value>)',
        'kb-text':    'rgb(var(--color-text) / <alpha-value>)',
        muted:        'rgb(var(--color-muted) / <alpha-value>)',
        line:         'rgb(var(--color-line) / <alpha-value>)',
        'line-strong':'rgb(var(--color-line-strong) / <alpha-value>)',
        accent:       'rgb(var(--color-accent) / <alpha-value>)',
        /* shadcn/ui compatibility layer */
        background:   'rgb(var(--background) / <alpha-value>)',
        foreground:   'rgb(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT:    'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT:    'rgb(var(--popover) / <alpha-value>)',
          foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT:    'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT:    'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT:    'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
        },
        border:       'rgb(var(--border) / <alpha-value>)',
        input:        'rgb(var(--input) / <alpha-value>)',
        ring:         'rgb(var(--ring) / <alpha-value>)',
      },
      fontFamily: {
        body:    ['var(--font-body)', 'Segoe UI', 'system-ui', 'sans-serif'],
        heading: ['var(--font-heading)', 'var(--font-body)', 'system-ui', 'sans-serif'],
        mono:    ["'Geist Mono'", "'SF Mono'", "'Fira Code'", 'monospace'],
      },
      maxWidth: {
        container: '1140px',
      },
      borderRadius: {
        sm:   '8px',
        md:   '10px',
        lg:   '12px',
        xl:   '16px',
        '2xl':'20px',
        '3xl':'24px',
        full: '999px',
      },
      boxShadow: {
        card:    '0 2px 24px rgba(0,0,0,0.07)',
        'card-lg':'0 8px 48px rgba(0,0,0,0.10), 0 24px 80px rgba(0,0,0,0.06)',
        tooltip: '0 4px 16px rgba(0,0,0,0.14)',
      },
      spacing: {
        'nav-height': 'var(--nav-height, 74px)',
      },
    },
  },
} satisfies Config;

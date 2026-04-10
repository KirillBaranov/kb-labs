import * as React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import type { ThemeMode } from './kb-config-provider';

export interface ThemeTransitionOverlayProps {
  show: boolean;
  theme: ThemeMode;
}

const themeConfig = {
  light: { icon: Sun, label: 'Light Mode' },
  dark: { icon: Moon, label: 'Dark Mode' },
  auto: { icon: Monitor, label: 'Auto Mode' },
};

export function ThemeTransitionOverlay({ show, theme }: ThemeTransitionOverlayProps) {
  const { icon: Icon, label } = themeConfig[theme];

  return (
    <div
      className="theme-transition-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        transform: show ? 'translateY(0)' : 'translateY(-100%)',
        transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms ease-in-out, color 150ms ease-in-out',
        pointerEvents: show ? 'auto' : 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          opacity: show ? 1 : 0,
          transition: 'opacity 200ms ease-in-out',
          transitionDelay: show ? '100ms' : '0ms',
        }}
      >
        <Icon
          size={48}
          strokeWidth={1.5}
          style={{
            color: 'var(--text-primary)',
            transition: 'color 150ms ease-in-out',
          }}
        />
        <div
          style={{
            fontSize: '18px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            transition: 'color 150ms ease-in-out',
          }}
        >
          Switching to {label}...
        </div>
      </div>
    </div>
  );
}

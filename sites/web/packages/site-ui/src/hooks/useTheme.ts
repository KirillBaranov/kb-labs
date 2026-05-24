'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'kb-theme';
const CYCLE: ThemePreference[] = ['light', 'dark', 'system'];

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyResolved(preference: ThemePreference) {
  const resolved = preference === 'system' ? getSystemTheme() : preference;
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    const initial: ThemePreference = stored ?? 'system';
    setPreferenceState(initial);
    applyResolved(initial);

    // Re-apply when system preference changes while set to "system"
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const cur = (localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ?? 'system';
      if (cur === 'system') applyResolved('system');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    applyResolved(next);
    if (next === 'system') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const idx = CYCLE.indexOf(preference);
    setTheme(CYCLE[(idx + 1) % CYCLE.length]);
  }, [preference, setTheme]);

  // Resolved actual applied theme
  const theme: Theme = preference === 'system'
    ? (mounted ? getSystemTheme() : 'light')
    : preference;

  return { theme, preference, setTheme, toggleTheme, mounted };
}

'use client';

import { useLayoutEffect } from 'react';

const STORAGE_KEY = 'kb-theme';

/**
 * Re-applies the stored theme class to <html> before every paint.
 * Prevents the dark→light→dark flash that occurs during client-side
 * locale navigation: Next.js reconciles a new RSC payload and briefly
 * drops imperative classList changes before useEffect can restore them.
 * useLayoutEffect fires synchronously after commit, before the browser paints.
 */
export function ThemeApplicator() {
  useLayoutEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (stored === 'light') {
        document.documentElement.classList.remove('dark');
      }
      // 'system' (no stored value): the blocking inline script in <head>
      // already set the correct class on first load; no change needed here.
    } catch {
      // localStorage unavailable — no-op
    }
  }); // no deps → runs every render, before paint

  return null;
}

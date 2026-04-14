'use client';

import { useEffect, useState } from 'react';

export type OS = 'windows' | 'mac' | 'linux';

export function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'linux';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('mac')) return 'mac';
  return 'linux';
}

/**
 * Returns the detected OS after hydration.
 * SSR-safe: returns `null` on first render to avoid hydration mismatch.
 */
export function usePlatform(): OS | null {
  const [os, setOs] = useState<OS | null>(null);
  useEffect(() => { setOs(detectOS()); }, []);
  return os;
}

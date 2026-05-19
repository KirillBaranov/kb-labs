import { useState, useEffect } from 'react';

/**
 * Returns a live-updating elapsed time string starting from `startedAt`.
 * Updates every second while the component is mounted.
 * Returns null if startedAt is not provided (step not yet started).
 *
 * Format: <60s → "42s", <1h → "2m 14s", ≥1h → "1h 03m"
 */
export function useElapsedTimer(startedAt: string | undefined): string | null {
  const [elapsed, setElapsed] = useState<string | null>(() =>
    startedAt ? formatElapsed(startedAt) : null,
  );

  useEffect(() => {
    if (!startedAt) {
      setElapsed(null);
      return;
    }

    setElapsed(formatElapsed(startedAt));

    const id = setInterval(() => {
      setElapsed(formatElapsed(startedAt));
    }, 1000);

    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

function formatElapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const totalSec = Math.max(0, Math.floor(ms / 1000));

  if (totalSec < 60) {
    return `${totalSec}s`;
  }
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) {
    const secs = totalSec % 60;
    return `${totalMin}m ${secs.toString().padStart(2, '0')}s`;
  }
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

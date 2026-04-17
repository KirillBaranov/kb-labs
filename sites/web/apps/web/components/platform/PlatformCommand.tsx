'use client';

import { useCallback } from 'react';
import { usePlatform, OS } from '@/hooks/usePlatform';
import { CopyButton } from '@/components/CopyButton';
import { useAnalytics } from '@/hooks/useAnalytics';
import s from './platform.module.css';

export interface PlatformCommands {
  /** Shown on macOS and Linux */
  unix: string;
  /** Shown on Windows. If omitted, unix command is shown for all platforms. */
  windows?: string;
}

interface Props {
  commands: PlatformCommands;
  /** Extra class applied to the outer wrapper */
  className?: string;
}

const LABELS: Record<OS, string> = {
  mac: 'macOS / Linux',
  linux: 'macOS / Linux',
  windows: 'Windows (PowerShell)',
};

/**
 * Renders the platform-appropriate install command with a copy button.
 * Falls back to the unix command until JS hydrates.
 */
export function PlatformCommand({ commands, className }: Props) {
  const os = usePlatform();
  const analytics = useAnalytics();

  const isWindows = os === 'windows';
  const cmd = isWindows && commands.windows ? commands.windows : commands.unix;
  const label = os ? LABELS[os] : 'macOS / Linux';

  const handleCopy = useCallback(() => {
    analytics.trackInstallCopy(cmd);
  }, [analytics, cmd]);

  return (
    <div className={[s.wrap, className].filter(Boolean).join(' ')}>
      <span className={s.label}>{label}</span>
      <div className={s.codeWrap}>
        <pre className={s.codeBlock}><code>{cmd}</code></pre>
        <CopyButton text={cmd} onCopy={handleCopy} />
      </div>
    </div>
  );
}

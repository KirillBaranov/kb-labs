import { UIBadge } from '@kb-labs/studio-ui-kit';

export function RunBadge({ status }: { status: 'pending' | 'ok' | 'warn' | 'fail' }) {
  const variantMap = {
    ok: 'success' as const,
    warn: 'warning' as const,
    fail: 'error' as const,
    pending: 'info' as const,
  };

  return <UIBadge variant={variantMap[status]}>{status.toUpperCase()}</UIBadge>;
}


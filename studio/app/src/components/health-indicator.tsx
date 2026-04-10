import { UIBadge } from '@kb-labs/studio-ui-kit';

export function HealthIndicator({ status }: { status: 'ok' | 'degraded' | 'down' }) {
  const variantMap = {
    ok: 'success' as const,
    degraded: 'warning' as const,
    down: 'error' as const,
  };

  return <UIBadge variant={variantMap[status]}>{status.toUpperCase()}</UIBadge>;
}


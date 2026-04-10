import { UICard, UIText, useUITheme } from '@kb-labs/studio-ui-kit';

interface ResourceQuotasProps {
  quotas: {
    timeoutMs?: number;
    memoryMb?: number;
    cpuMs?: number;
  };
}

export function ResourceQuotas({ quotas }: ResourceQuotasProps) {
  const { token } = useUITheme();

  return (
    <UICard title="Resource Quotas">
      <UIText color="secondary" style={{ marginBottom: 16, display: 'block' }}>
        Maximum resource limits for this plugin to prevent runaway processes and ensure system
        stability.
      </UIText>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        {quotas.timeoutMs && (
          <UICard size="small">
            <div style={{ textAlign: 'center' }}>
              <UIText
                color="secondary"
                style={{
                  fontSize: token.fontSizeSM,
                  display: 'block',
                  marginBottom: 8,
                }}
              >
                Timeout
              </UIText>
              <UIText weight="semibold" style={{ fontSize: 20 }}>
                {quotas.timeoutMs}
              </UIText>
              <UIText color="secondary" style={{ fontSize: token.fontSizeSM }}>
                ms
              </UIText>
            </div>
          </UICard>
        )}
        {quotas.memoryMb && (
          <UICard size="small">
            <div style={{ textAlign: 'center' }}>
              <UIText
                color="secondary"
                style={{
                  fontSize: token.fontSizeSM,
                  display: 'block',
                  marginBottom: 8,
                }}
              >
                Memory
              </UIText>
              <UIText weight="semibold" style={{ fontSize: 20 }}>
                {quotas.memoryMb}
              </UIText>
              <UIText color="secondary" style={{ fontSize: token.fontSizeSM }}>
                MB
              </UIText>
            </div>
          </UICard>
        )}
        {quotas.cpuMs && (
          <UICard size="small">
            <div style={{ textAlign: 'center' }}>
              <UIText
                color="secondary"
                style={{
                  fontSize: token.fontSizeSM,
                  display: 'block',
                  marginBottom: 8,
                }}
              >
                CPU Time
              </UIText>
              <UIText weight="semibold" style={{ fontSize: 20 }}>
                {quotas.cpuMs}
              </UIText>
              <UIText color="secondary" style={{ fontSize: token.fontSizeSM }}>
                ms
              </UIText>
            </div>
          </UICard>
        )}
      </div>
    </UICard>
  );
}

import { UISpace, UICard, UIText, UITag } from '@kb-labs/studio-ui-kit';

interface EnvPermissionsProps {
  permissions: {
    read: string[];
  };
}

export function EnvPermissions({ permissions }: EnvPermissionsProps) {
  return (
    <UICard title="Environment Variables">
      <UIText color="secondary" style={{ marginBottom: 16, display: 'block' }}>
        System environment variables that this plugin can access. Used for configuration and
        secrets management.
      </UIText>
      <div>
        <UIText weight="bold">Read Access:</UIText>
        <div style={{ marginTop: 8 }}>
          <UISpace wrap>
            {permissions.read.map((env: string, idx: number) => (
              <UITag key={idx} color="cyan">
                {env}
              </UITag>
            ))}
          </UISpace>
        </div>
      </div>
    </UICard>
  );
}

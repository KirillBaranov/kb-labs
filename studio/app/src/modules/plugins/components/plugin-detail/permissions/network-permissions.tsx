import { UISpace, UICard, UIText, UIIcon, useUITheme } from '@kb-labs/studio-ui-kit';

interface NetworkPermissionsProps {
  permissions: {
    fetch: string[];
  };
}

export function NetworkPermissions({ permissions }: NetworkPermissionsProps) {
  const { token } = useUITheme();

  return (
    <UICard
      title={
        <UISpace>
          <UIIcon name="GlobalOutlined" />
          <span>Network Permissions</span>
        </UISpace>
      }
    >
      <UIText color="secondary" style={{ marginBottom: 16, display: 'block' }}>
        External hosts and APIs that this plugin can communicate with over the network.
      </UIText>
      <div>
        <UIText weight="semibold">Allowed Hosts:</UIText>
        <div style={{ marginTop: 8 }}>
          {permissions.fetch.map((host: string, idx: number) => (
            <div key={idx} style={{ marginBottom: 4 }}>
              <UIText
                style={{
                  fontSize: token.fontSizeSM,
                  fontFamily: token.fontFamilyCode,
                }}
              >
                {host}
              </UIText>
            </div>
          ))}
        </div>
      </div>
    </UICard>
  );
}

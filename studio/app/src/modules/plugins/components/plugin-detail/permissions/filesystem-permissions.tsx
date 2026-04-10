import { UISpace, UICard, UIText, UIIcon, useUITheme } from '@kb-labs/studio-ui-kit';

interface FilesystemPermissionsProps {
  permissions: {
    read?: string[];
    write?: string[];
  };
}

export function FilesystemPermissions({ permissions }: FilesystemPermissionsProps) {
  const { token } = useUITheme();

  return (
    <UICard
      title={
        <UISpace>
          <UIIcon name="LockOutlined" />
          <span>Filesystem Permissions</span>
        </UISpace>
      }
    >
      <UIText color="secondary" style={{ marginBottom: 16, display: 'block' }}>
        File and directory access patterns that this plugin is allowed to use. Read access allows
        viewing files, write access allows creating or modifying files.
      </UIText>
      <UISpace direction="vertical" size="middle" style={{ width: '100%' }}>
        {permissions.read && permissions.read.length > 0 && (
          <div>
            <UIText weight="semibold">Read Access:</UIText>
            <div style={{ marginTop: 8 }}>
              {permissions.read.map((path: string, idx: number) => (
                <div key={idx} style={{ marginBottom: 4 }}>
                  <UIText
                    style={{
                      fontSize: token.fontSizeSM,
                      fontFamily: token.fontFamilyCode,
                    }}
                  >
                    {path}
                  </UIText>
                </div>
              ))}
            </div>
          </div>
        )}
        {permissions.write && permissions.write.length > 0 && (
          <div>
            <UIText weight="semibold">Write Access:</UIText>
            <div style={{ marginTop: 8 }}>
              {permissions.write.map((path: string, idx: number) => (
                <div key={idx} style={{ marginBottom: 4 }}>
                  <UIText
                    style={{
                      fontSize: token.fontSizeSM,
                      fontFamily: token.fontFamilyCode,
                    }}
                  >
                    {path}
                  </UIText>
                </div>
              ))}
            </div>
          </div>
        )}
      </UISpace>
    </UICard>
  );
}

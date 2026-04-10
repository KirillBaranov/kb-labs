import { UISpace, UIEmptyState, UICard } from '@kb-labs/studio-ui-kit';
import { FilesystemPermissions } from './permissions/filesystem-permissions';
import { NetworkPermissions } from './permissions/network-permissions';
import { EnvPermissions } from './permissions/env-permissions';
import { ShellPermissions } from './permissions/shell-permissions';
import { PlatformServices } from './permissions/platform-services';
import { ResourceQuotas } from './permissions/resource-quotas';

interface PermissionsViewProps {
  permissions: any;
}

export function PermissionsView({ permissions }: PermissionsViewProps) {
  if (!permissions) {
    return (
      <UICard>
        <UIEmptyState description="No permissions specified for this plugin" />
      </UICard>
    );
  }

  return (
    <UISpace direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Filesystem Permissions */}
      {permissions.fs && <FilesystemPermissions permissions={permissions.fs} />}

      {/* Network Permissions */}
      {permissions.network?.fetch && permissions.network.fetch.length > 0 && (
        <NetworkPermissions permissions={permissions.network} />
      )}

      {/* Environment Variables */}
      {permissions.env?.read && permissions.env.read.length > 0 && (
        <EnvPermissions permissions={permissions.env} />
      )}

      {/* Shell Permissions */}
      {permissions.shell && <ShellPermissions permissions={permissions.shell} />}

      {/* Platform Services */}
      {permissions.platform && <PlatformServices permissions={permissions.platform} />}

      {/* Quotas */}
      {permissions.quotas && <ResourceQuotas quotas={permissions.quotas} />}
    </UISpace>
  );
}

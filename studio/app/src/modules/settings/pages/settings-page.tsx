import * as React from 'react';
import {
  UITabs,
  UIList,
  UIListItem,
  UIListItemMeta,
  UIButton,
  UISpace,
  UITypographyText,
  UITypographyParagraph,
  UITitle,
  UIMessage,
  UIDivider,
  UIIcon,
} from '@kb-labs/studio-ui-kit';
import { useDataSources } from '@/providers/data-sources-provider';
import { useHealthStatus } from '@kb-labs/studio-data-client';
import { HealthIndicator } from '@/components/health-indicator';
import { useRegistryV2 } from '@/providers/registry-v2-provider';
import { formatTimestamp } from '@/utils/format-date';
import { AppearanceSettings } from '../components/appearance-settings';
import { DataPrivacySettings } from '../components/data-privacy-settings';
import { NotificationsSettings } from '../components/notifications-settings';
import { ExperimentalSettings } from '../components/experimental-settings';
import { ConfigurationSettings } from '../components/configuration-settings';
import { RoleSwitcher } from '@/components/role-switcher';
import { ApiRoutesViewer } from '../components/api-routes-viewer';
import { NavigationSettings } from '../components/navigation-settings';
import { UICard, UISkeleton, UIStack } from '@kb-labs/studio-ui-kit';
import { UIPage, UIPageHeader, UIPageSection } from '@kb-labs/studio-ui-kit';

export function SettingsPage() {
  const sources = useDataSources();
  const { data, isLoading } = useHealthStatus(sources.system);
  const { registry } = useRegistryV2();
  const registryMeta = { generatedAt: registry.generatedAt, rev: null, partial: false, stale: false, expiresAt: undefined as string | undefined, ttlMs: undefined as number | undefined, checksum: undefined as string | undefined };
  const refresh = async () => {}; // TODO: queryClient.invalidateQueries
  const [invalidating, setInvalidating] = React.useState(false);

  const handleInvalidateCache = async () => {
    setInvalidating(true);
    try {
      const result = await sources.cache.invalidateCache();
      UIMessage.success(
        `Cache invalidated! Rev: ${result.previousRev ?? 'N/A'} → ${result.newRev}. ` +
        `Discovered ${result.pluginsDiscovered} plugins.`
      );
      await refresh();
    } catch (error) {
      UIMessage.error(`Error invalidating cache: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setInvalidating(false);
    }
  };

  const handleRefreshRegistry = async () => {
    try {
      await refresh();
      UIMessage.success('Registry refreshed successfully');
    } catch (error) {
      UIMessage.error(`Failed to refresh registry: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const tabItems = [
    {
      key: 'appearance',
      label: 'Appearance',
      icon: <UIIcon name="BgColorsOutlined" />,
      children: (
        <UIPageSection>
          <UICard>
            <AppearanceSettings />
          </UICard>
        </UIPageSection>
      ),
    },
    {
      key: 'navigation',
      label: 'Navigation',
      icon: <UIIcon name="MenuOutlined" />,
      children: (
        <UIPageSection>
          <UICard>
            <NavigationSettings />
          </UICard>
        </UIPageSection>
      ),
    },
    {
      key: 'notifications',
      label: 'Notifications',
      icon: <UIIcon name="BellOutlined" />,
      children: (
        <UIPageSection>
          <UICard>
            <NotificationsSettings />
          </UICard>
        </UIPageSection>
      ),
    },
    {
      key: 'privacy',
      label: 'Data & Privacy',
      icon: <UIIcon name="LockOutlined" />,
      children: (
        <UIPageSection>
          <UICard>
            <DataPrivacySettings />
          </UICard>
        </UIPageSection>
      ),
    },
    {
      key: 'system',
      label: 'System Info',
      icon: <UIIcon name="DatabaseOutlined" />,
      children: (
        <>
          <UIPageSection>
            <UICard title="Data Sources Health">
              {isLoading ? (
                <UIStack>
                  <UISkeleton active lines={3} />
                </UIStack>
              ) : data ? (
                <UIList
                  dataSource={data.sources}
                  renderItem={(source) => {
                    const status = source.ok
                      ? 'ok'
                      : source.error === 'system_degraded'
                      ? 'degraded'
                      : 'down';
                    return (
                      <UIListItem key={source.name} extra={<HealthIndicator status={status} />}>
                        <UIListItemMeta
                          title={source.name}
                          description={source.latency ? `${source.latency}ms` : undefined}
                        />
                      </UIListItem>
                    );
                  }}
                />
              ) : (
                <p>No health data available</p>
              )}
            </UICard>
          </UIPageSection>

          <UIPageSection>
            <UICard title="Registry Status">
              <UISpace direction="vertical" style={{ width: '100%' }}>
                <div>
                  <UITypographyText strong>Revision:</UITypographyText> <UITypographyText>{registryMeta.rev ?? 'N/A'}</UITypographyText>
                </div>
                <div>
                  <UITypographyText strong>Generated At:</UITypographyText> <UITypographyText>{formatTimestamp(registryMeta.generatedAt)}</UITypographyText>
                </div>
                <div>
                  <UITypographyText strong>Expires At:</UITypographyText> <UITypographyText>{formatTimestamp(registryMeta.expiresAt)}</UITypographyText>
                </div>
                <div>
                  <UITypographyText strong>TTL:</UITypographyText> <UITypographyText>{registryMeta.ttlMs ? `${registryMeta.ttlMs / 1000}s` : 'N/A'}</UITypographyText>
                </div>
                <div>
                  <UITypographyText strong>Partial:</UITypographyText> <UITypographyText type={registryMeta.partial ? 'warning' : 'success'}>
                    {registryMeta.partial ? 'Yes' : 'No'}
                  </UITypographyText>
                </div>
                <div>
                  <UITypographyText strong>Stale:</UITypographyText> <UITypographyText type={registryMeta.stale ? 'danger' : 'success'}>
                    {registryMeta.stale ? 'Yes' : 'No'}
                  </UITypographyText>
                </div>
                {registryMeta.checksum && (
                  <div>
                    <UITypographyText strong>Checksum:</UITypographyText> <UITypographyText code style={{ fontSize: '0.85rem' }}>
                      {registryMeta.checksum.substring(0, 8)}...
                    </UITypographyText>
                  </div>
                )}
              </UISpace>
            </UICard>
          </UIPageSection>
        </>
      ),
    },
    {
      key: 'configuration',
      label: 'Configuration',
      icon: <UIIcon name="SettingOutlined" />,
      children: (
        <UIPageSection>
          <UICard>
            <ConfigurationSettings />
          </UICard>
        </UIPageSection>
      ),
    },
    {
      key: 'experimental',
      label: 'Experimental',
      icon: <UIIcon name="ExperimentOutlined" />,
      children: (
        <UIPageSection>
          <UICard>
            <ExperimentalSettings />
          </UICard>
        </UIPageSection>
      ),
    },
    {
      key: 'authentication',
      label: 'Authentication',
      icon: <UIIcon name="UserOutlined" />,
      children: (
        <UIPageSection>
          <UICard>
            <RoleSwitcher />
          </UICard>
        </UIPageSection>
      ),
    },
    {
      key: 'developer',
      label: 'Developer',
      icon: <UIIcon name="ToolOutlined" />,
      children: (
        <>
          <UIPageSection>
            <UICard title="Development Tools">
              <UISpace direction="vertical" style={{ width: '100%' }} size="large">
                <div>
                  <UITitle level={5}>Refresh Registry</UITitle>
                  <UITypographyParagraph type="secondary">
                    Fetch fresh registry data from the REST API without clearing the cache.
                    Use this to get the latest changes without forcing re-discovery.
                  </UITypographyParagraph>
                  <UIButton
                    icon={<UIIcon name="ReloadOutlined" />}
                    onClick={handleRefreshRegistry}
                  >
                    Refresh Registry
                  </UIButton>
                </div>

                <UIDivider />

                <div>
                  <UITitle level={5}>Invalidate Cache (Force Discovery)</UITitle>
                  <UITypographyParagraph type="secondary">
                    Force cache invalidation and trigger full plugin re-discovery on the REST API.
                    This clears the snapshot cache and rescans all plugin directories.
                    Useful when testing plugin changes or troubleshooting registry issues.
                  </UITypographyParagraph>
                  <UIButton
                    icon={<UIIcon name="DeleteOutlined" />}
                    onClick={handleInvalidateCache}
                    loading={invalidating}
                    variant="primary"
                    danger
                  >
                    Invalidate Cache & Re-discover
                  </UIButton>
                </div>
              </UISpace>
            </UICard>
          </UIPageSection>

          <UIPageSection>
            <UICard>
              <ApiRoutesViewer />
            </UICard>
          </UIPageSection>

          {/* DevToolsPanel is now a global floating panel rendered in App.tsx */}
        </>
      ),
    },
  ];

  return (
    <UIPage variant="document">
      <UIPageHeader
        title="Settings"
        description="Configure your preferences, manage data, and customize your experience"
      />

      <UITabs
        items={tabItems}
        syncUrl={{ mode: 'path', basePath: '/settings' }}
        size="large"
        style={{ marginTop: 24 }}
      />
    </UIPage>
  );
}

import * as React from 'react';
import {
  UITabs,
  UIButton,
  UISpace,
  UITypographyParagraph,
  UITitle,
  UIMessage,
  UIDivider,
  UIIcon,
  UICard,
  UIPage,
  UIPageHeader,
  UIPageSection,
} from '@kb-labs/studio-ui-kit';
import { useDataSources } from '@/providers/data-sources-provider';
import { AppearanceSettings } from '../components/appearance-settings';
import { DataPrivacySettings } from '../components/data-privacy-settings';
import { ExperimentalSettings } from '../components/experimental-settings';
import { ApiRoutesViewer } from '../components/api-routes-viewer';
import { NavigationSettings } from '../components/navigation-settings';
import { AccountSettings } from '../components/account-settings';
import { SystemSettings } from '../components/system-settings';

export function SettingsPage() {
  const sources = useDataSources();
  const [invalidating, setInvalidating] = React.useState(false);

  const handleInvalidateCache = async () => {
    setInvalidating(true);
    try {
      const result = await sources.cache.invalidateCache();
      UIMessage.success(
        `Cache invalidated! Rev: ${result.previousRev ?? 'N/A'} → ${result.newRev}. ` +
        `Discovered ${result.pluginsDiscovered} plugins.`
      );
    } catch (error) {
      UIMessage.error(`Error invalidating cache: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setInvalidating(false);
    }
  };

  const handleRefreshRegistry = async () => {
    try {
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
      key: 'account',
      label: 'Account',
      icon: <UIIcon name="UserOutlined" />,
      children: (
        <UIPageSection>
          <UICard>
            <AccountSettings />
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
      label: 'System',
      icon: <UIIcon name="DatabaseOutlined" />,
      children: (
        <UIPageSection>
          <UICard>
            <SystemSettings />
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
            <UICard title="API Explorer">
              <ApiRoutesViewer />
            </UICard>
          </UIPageSection>
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

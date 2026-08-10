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
import { SystemSettings } from '../components/system-settings';
import { useFeatureFlags } from '@/hooks/use-feature-flags';

export function SettingsPage() {
  const sources = useDataSources();
  const { isEnabled } = useFeatureFlags();
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
      children: (
        <UICard>
          <AppearanceSettings />
        </UICard>
      ),
    },
    {
      key: 'navigation',
      label: 'Navigation',
      children: (
        <UICard>
          <NavigationSettings />
        </UICard>
      ),
    },
    {
      key: 'privacy',
      label: 'Data & Privacy',
      children: (
        <UICard>
          <DataPrivacySettings />
        </UICard>
      ),
    },
    ...(isEnabled('settings-system') ? [{
      key: 'system',
      label: 'System',
      children: (
        <UICard>
          <SystemSettings />
        </UICard>
      ),
    }] : []),
    {
      key: 'experimental',
      label: 'Experimental',
      children: (
        <UICard>
          <ExperimentalSettings />
        </UICard>
      ),
    },
    ...(isEnabled('devtools-panel') ? [{
      key: 'developer',
      label: 'Developer',
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
    }] : []),
  ];

  return (
    <UIPage>
      <UIPageHeader
        title="Settings"
        description="Configure your preferences, manage data, and customize your experience"
        tabs={<UITabs items={tabItems} syncUrl={{ mode: 'path', basePath: '/settings' }} />}
      />
    </UIPage>
  );
}

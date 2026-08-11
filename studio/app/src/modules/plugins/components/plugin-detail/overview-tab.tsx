import {
  UISpace,
  UITypographyText,
  UICard,
  UIAlert,
  UIIcon,
} from '@kb-labs/studio-ui-kit';
import type { PluginManifestEntry } from '@kb-labs/studio-data-client';
import { PluginMarkdownContent } from './plugin-markdown-content';

export interface OverviewTabProps {
  plugin: PluginManifestEntry;
  readmeContent: string | null;
  readmeLoading: boolean;
  readmeError: string | null;
}

export function OverviewTab({ plugin, readmeContent, readmeLoading, readmeError }: OverviewTabProps) {
  const { manifest } = plugin;
  const display = manifest.display;
  const hasDetails = display?.author || plugin.discoveredAt || plugin.buildTimestamp;

  return (
    <UISpace direction="vertical" size="large" style={{ width: '100%' }}>
      {plugin.validation && !plugin.validation.valid && (
        <UIAlert
          variant="error"
          icon={<UIIcon name="CloseCircleOutlined" />}
          message={`Manifest Validation Failed (${plugin.validation.errors.length} error${plugin.validation.errors.length > 1 ? 's' : ''})`}
          description={
            <div style={{ marginTop: 8 }}>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {plugin.validation.errors.map((error, idx) => (
                  <li key={idx} style={{ marginBottom: 4 }}>
                    <UITypographyText code style={{ fontSize: 12 }}>{error}</UITypographyText>
                  </li>
                ))}
              </ul>
            </div>
          }
          showIcon
        />
      )}

      {hasDetails && (
        <UICard title="Details">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
            }}
          >
            {display?.author && (
              <div>
                <UITypographyText type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Author
                </UITypographyText>
                <UISpace size="small">
                  <UIIcon name="UserOutlined" />
                  <UITypographyText>{display.author}</UITypographyText>
                </UISpace>
              </div>
            )}

            <div>
              <UITypographyText type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                Plugin ID
              </UITypographyText>
              <UITypographyText code copyable style={{ fontSize: 12 }}>
                {manifest.id}
              </UITypographyText>
            </div>

            {plugin.discoveredAt && (
              <div>
                <UITypographyText type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Discovered
                </UITypographyText>
                <UISpace size="small">
                  <UIIcon name="SearchOutlined" />
                  <UITypographyText style={{ fontSize: 13 }}>
                    {new Date(plugin.discoveredAt).toLocaleString()}
                  </UITypographyText>
                </UISpace>
              </div>
            )}

            {plugin.buildTimestamp && (
              <div>
                <UITypographyText type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Last Built
                </UITypographyText>
                <UISpace size="small">
                  <UIIcon name="ClockCircleOutlined" />
                  <UITypographyText style={{ fontSize: 13 }}>
                    {new Date(plugin.buildTimestamp).toLocaleString()}
                  </UITypographyText>
                </UISpace>
              </div>
            )}
          </div>
        </UICard>
      )}

      <PluginMarkdownContent
        content={readmeContent}
        loading={readmeLoading}
        error={readmeError}
        emptyText="This plugin has no README.md"
      />
    </UISpace>
  );
}

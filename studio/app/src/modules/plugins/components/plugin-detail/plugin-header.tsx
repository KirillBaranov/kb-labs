import { UISpace, UIAccordion, UICard, UIText, UITitle, UITag, UIIcon, useUITheme } from '@kb-labs/studio-ui-kit';
import type { PluginManifestEntry } from '@kb-labs/studio-data-client';

interface PluginHeaderProps {
  plugin: PluginManifestEntry;
}

export function PluginHeader({ plugin }: PluginHeaderProps) {
  const { token } = useUITheme();
  const { manifest } = plugin;
  const display = manifest.display;

  return (
    <UICard>
      <UISpace direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Icon + Name + Version */}
        <UISpace align="start" size="large">
          <div style={{ fontSize: 64, lineHeight: 1 }}>{display?.icon || ''}</div>
          <div style={{ flex: 1 }}>
            <UITitle level={2} style={{ marginBottom: 4 }}>
              {display?.name || manifest.id}
            </UITitle>
            <UISpace size="middle">
              <UIText color="secondary" style={{ fontSize: 16 }}>
                v{manifest.version}
              </UIText>
              <UITag color="blue">
                {typeof plugin.source === 'string'
                  ? plugin.source
                  : plugin.source?.kind || 'unknown'}
              </UITag>
              <UITag>{manifest.schema}</UITag>
            </UISpace>
          </div>
        </UISpace>

        {/* Description */}
        {display?.description && (
          <UIText style={{ fontSize: 15, marginBottom: 0, color: token.colorTextSecondary }}>
            {display.description}
          </UIText>
        )}

        {/* Tags */}
        {display?.tags && display.tags.length > 0 && (
          <UISpace wrap>
            {display.tags.map((tag, idx) => (
              <UITag key={typeof tag === 'string' ? tag : `tag-${idx}`} color="default">
                {typeof tag === 'string' ? tag : JSON.stringify(tag)}
              </UITag>
            ))}
          </UISpace>
        )}

        {/* Metadata Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginTop: 8,
          }}
        >
          {display?.author && (
            <div>
              <UIText
                color="secondary"
                style={{ fontSize: token.fontSizeSM, display: 'block', marginBottom: 4 }}
              >
                Author
              </UIText>
              <UISpace>
                <UIIcon name="UserOutlined" />
                <UIText>{display.author}</UIText>
              </UISpace>
            </div>
          )}
          <div>
            <UIText
              color="secondary"
              style={{ fontSize: token.fontSizeSM, display: 'block', marginBottom: 4 }}
            >
              Plugin ID
            </UIText>
            <UIText style={{ fontFamily: token.fontFamilyCode }}>{manifest.id}</UIText>
          </div>
        </div>

        {/* Links */}
        {(display?.homepage || display?.repository) && (
          <UISpace size="large">
            {display?.homepage && (
              <a href={display.homepage} target="_blank" rel="noopener noreferrer">
                <UISpace>
                  <UIIcon name="GlobalOutlined" />
                  Homepage
                </UISpace>
              </a>
            )}
            {display?.repository && (
              <a href={display.repository} target="_blank" rel="noopener noreferrer">
                <UISpace>
                  <UIIcon name="LinkOutlined" />
                  Repository
                </UISpace>
              </a>
            )}
          </UISpace>
        )}

        {/* Timestamps */}
        {(plugin.discoveredAt || plugin.buildTimestamp) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
            }}
          >
            {plugin.discoveredAt && (
              <div>
                <UIText
                  color="secondary"
                  style={{ fontSize: token.fontSizeSM, display: 'block', marginBottom: 4 }}
                >
                  Discovered At
                </UIText>
                <UISpace>
                  <UIIcon name="SearchOutlined" />
                  <UIText>{new Date(plugin.discoveredAt).toLocaleString()}</UIText>
                </UISpace>
              </div>
            )}
            {plugin.buildTimestamp && (
              <div>
                <UIText
                  color="secondary"
                  style={{ fontSize: token.fontSizeSM, display: 'block', marginBottom: 4 }}
                >
                  Last Built
                </UIText>
                <UISpace>
                  <UIIcon name="ClockCircleOutlined" />
                  <UIText>{new Date(plugin.buildTimestamp).toLocaleString()}</UIText>
                </UISpace>
              </div>
            )}
          </div>
        )}

        {/* Plugin Root (collapsible) */}
        <UIAccordion
          ghost
          items={[
            {
              key: 'root',
              label: 'Plugin Root Path',
              children: (
                <UIText style={{ fontSize: token.fontSizeSM, fontFamily: token.fontFamilyCode }}>
                  {plugin.pluginRoot}
                </UIText>
              ),
            },
          ]}
        />
      </UISpace>
    </UICard>
  );
}

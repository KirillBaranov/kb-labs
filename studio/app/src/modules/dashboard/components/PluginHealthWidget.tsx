import React from 'react';
import {
  UICard,
  UITag,
  UIEmptyState,
  UISkeleton,
  UISpace,
} from '@kb-labs/studio-ui-kit';
import {
  AppstoreOutlined,
  ApiOutlined,
  LayoutOutlined,
  ToolOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { usePluginsRegistry } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import type { PluginManifestEntry } from '@kb-labs/studio-data-client';

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: ok ? 'var(--success)' : 'var(--error)',
        flexShrink: 0,
      }}
    />
  );
}

function CapabilityTags({ entry }: { entry: PluginManifestEntry }) {
  const m = entry.manifest;
  const tags: Array<{ label: string; icon: React.ReactNode }> = [];

  if (m.cli?.commands && m.cli.commands.length > 0)
    tags.push({ label: 'CLI', icon: <ToolOutlined /> });
  if (m.rest?.routes && m.rest.routes.length > 0)
    tags.push({ label: 'REST', icon: <ApiOutlined /> });
  if (m.studio?.pages && m.studio.pages.length > 0)
    tags.push({ label: 'Studio', icon: <LayoutOutlined /> });
  if (m.jobs?.handlers && m.jobs.handlers.length > 0)
    tags.push({ label: 'Jobs', icon: <ClockCircleOutlined /> });

  if (tags.length === 0) return null;

  return (
    <UISpace size={4} wrap>
      {tags.map(({ label, icon }) => (
        <UITag key={label} icon={icon} style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}>
          {label}
        </UITag>
      ))}
    </UISpace>
  );
}

export function PluginHealthWidget() {
  const sources = useDataSources();
  const { data, isLoading } = usePluginsRegistry(sources.plugins);

  const manifests = data?.manifests ?? [];
  const withRest = manifests.filter(m => (m.manifest.rest?.routes?.length ?? 0) > 0).length;
  const withStudio = manifests.filter(m => (m.manifest.studio?.pages?.length ?? 0) > 0).length;
  const withErrors = manifests.filter(m => m.validation && !m.validation.valid).length;

  const title = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AppstoreOutlined />
        <span>Plugins</span>
      </div>
      {!isLoading && manifests.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>
          {manifests.length} total · {withRest} REST · {withStudio} Studio
          {withErrors > 0 && (
            <span style={{ color: 'var(--error)', marginLeft: 6 }}>· {withErrors} errors</span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <UICard title={title} style={{ height: '100%' }}>
      {isLoading ? (
        <UISkeleton active lines={5} />
      ) : manifests.length === 0 ? (
        <UIEmptyState
          image={UIEmptyState.PRESENTED_IMAGE_SIMPLE}
          description="No plugins discovered"
        />
      ) : (
        <div>
          {manifests.map((entry) => {
            const isValid = !entry.validation || entry.validation.valid;
            const name = entry.manifest.display?.name ?? entry.pluginId;
            const version = entry.manifest.version;

            return (
              <div
                key={entry.pluginId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 0',
                  borderTop: '1px solid var(--border-secondary)',
                  fontSize: 13,
                }}
              >
                <StatusDot ok={isValid} />
                <span
                  style={{ flex: '0 0 auto', fontWeight: 500, minWidth: 120 }}
                  title={entry.pluginId}
                >
                  {name}
                </span>
                <div style={{ flex: 1 }}>
                  <CapabilityTags entry={entry} />
                </div>
                <UITag style={{ fontSize: 11, margin: 0, flexShrink: 0 }}>{version}</UITag>
              </div>
            );
          })}
        </div>
      )}
    </UICard>
  );
}

import { UICard, UITag, UITooltip, UIButton, UIIcon } from '@kb-labs/studio-ui-kit';
import {
  ApiOutlined,
  ClockCircleOutlined,
  LayoutOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { PluginManifestEntry } from '@kb-labs/studio-data-client';

interface MarketplaceCardProps {
  plugin: PluginManifestEntry;
  onClick: () => void;
}

const SURFACE_CONFIG = [
  { key: 'cli', label: 'CLI', icon: <ToolOutlined />, getCount: (m: any) => m.cli?.commands?.length ?? 0 },
  { key: 'studio', label: 'Studio', icon: <LayoutOutlined />, getCount: (m: any) => m.studio?.pages?.length ?? 0 },
  { key: 'rest', label: 'REST', icon: <ApiOutlined />, getCount: (m: any) => m.rest?.routes?.length ?? 0 },
  { key: 'workflows', label: 'Workflows', icon: <ThunderboltOutlined />, getCount: (m: any) => m.workflows?.handlers?.length ?? 0 },
  { key: 'jobs', label: 'Jobs', icon: <ClockCircleOutlined />, getCount: (m: any) => m.jobs?.handlers?.length ?? 0 },
];

export function MarketplaceCard({ plugin, onClick }: MarketplaceCardProps) {
  const { manifest } = plugin;
  const display = manifest.display;

  const surfaces = SURFACE_CONFIG.filter(s => s.getCount(manifest) > 0);
  const hasPermWarning = !!manifest.permissions;
  const hasError = plugin.validation && !plugin.validation.valid;

  const name = display?.name || manifest.id;
  const iconLetter = name.charAt(0).toUpperCase();

  const title = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span
        style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: 'var(--bg-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)',
          fontFamily: 'var(--font-heading)',
        }}
      >
        {iconLetter}
      </span>
      <div style={{ minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
          lineHeight: 1.3, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden',
        }}>
          {name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>v{manifest.version}</div>
      </div>
    </div>
  );

  const extra = hasError ? (
    <UITag variant="error">Invalid</UITag>
  ) : (
    <UITag variant="success">Installed</UITag>
  );

  return (
    <UICard
      title={title}
      extra={extra}
      hoverable
      status={hasError ? 'error' : 'default'}
      onClick={onClick}
      style={{ height: '100%', cursor: 'pointer' }}
      styles={{ body: { display: 'flex', flexDirection: 'column', gap: 14, height: 'calc(100% - 56px)' } }}
    >
      <div style={{
        fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden', flex: 1,
      }}>
        {display?.description || 'No description'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {surfaces.map(s => (
            <UITooltip key={s.key} title={`${s.getCount(manifest)} ${s.label}`}>
              <UITag variant="neutral" icon={s.icon} style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}>
                {s.label}
              </UITag>
            </UITooltip>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {hasPermWarning && (
            <UITooltip title="Requires permissions">
              <UIIcon name="WarningOutlined" style={{ fontSize: 13, color: 'var(--warning)' }} />
            </UITooltip>
          )}
          <UIButton
            size="small"
            style={{ fontSize: 12, height: 26, padding: '0 10px' }}
            onClick={e => { e.stopPropagation(); onClick(); }}
          >
            Open
          </UIButton>
        </div>
      </div>
    </UICard>
  );
}

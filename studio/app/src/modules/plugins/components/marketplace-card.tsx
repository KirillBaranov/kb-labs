import { useState } from 'react';
import { UITooltip, UIButton, UIIcon } from '@kb-labs/studio-ui-kit';
import type { PluginManifestEntry } from '@kb-labs/studio-data-client';

interface MarketplaceCardProps {
  plugin: PluginManifestEntry;
  onClick: () => void;
}

const SURFACE_CONFIG = [
  { key: 'cli',       label: 'CLI',      color: '#6366f1', bg: 'rgba(99,102,241,0.10)',  getCount: (m: any) => m.cli?.commands?.length ?? 0 },
  { key: 'studio',    label: 'Studio',   color: '#0c66ff', bg: 'rgba(12,102,255,0.10)',  getCount: (m: any) => m.studio?.pages?.length ?? 0 },
  { key: 'rest',      label: 'REST',     color: '#10b981', bg: 'rgba(16,185,129,0.10)',  getCount: (m: any) => m.rest?.routes?.length ?? 0 },
  { key: 'workflows', label: 'Workflows',color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)', getCount: (m: any) => m.workflows?.handlers?.length ?? 0 },
  { key: 'jobs',      label: 'Jobs',     color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', getCount: (m: any) => m.jobs?.handlers?.length ?? 0 },
];

export function MarketplaceCard({ plugin, onClick }: MarketplaceCardProps) {
  const [hovered, setHovered] = useState(false);
  const { manifest } = plugin;
  const display = manifest.display;

  const surfaces = SURFACE_CONFIG.filter(s => s.getCount(manifest) > 0);
  const hasPermWarning = !!manifest.permissions;
  const hasError = plugin.validation && !plugin.validation.valid;

  const name = display?.name || manifest.id;
  const iconLetter = name.charAt(0).toUpperCase();
  const iconBg = stringToColor(manifest.id);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-secondary)',
        border: `1px solid ${hovered ? 'var(--border-secondary)' : 'var(--border-primary)'}`,
        borderRadius: 12,
        padding: '20px',
        cursor: 'pointer',
        transition: 'border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-1px)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Top: icon + status badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 11, flexShrink: 0,
          background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 700, color: '#fff',
          fontFamily: 'var(--font-heading)',
        }}>
          {iconLetter}
        </div>

        {hasError ? (
          <StatusBadge color="#ff4d4f" bg="rgba(255,77,79,0.10)">Invalid</StatusBadge>
        ) : (
          <StatusBadge color="#52c41a" bg="rgba(82,196,26,0.10)">Installed</StatusBadge>
        )}
      </div>

      {/* Name + version */}
      <div>
        <div style={{
          fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
          lineHeight: 1.3, marginBottom: 3,
          fontFamily: 'var(--font-heading)',
        }}>
          {name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          v{manifest.version}
        </div>
      </div>

      {/* Description */}
      <div style={{
        fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden', flex: 1,
      }}>
        {display?.description || 'No description'}
      </div>

      {/* Footer: surfaces + warning */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {surfaces.map(s => (
            <UITooltip key={s.key} title={`${s.getCount(manifest)} ${s.label}`}>
              <span style={{
                fontSize: 11, fontWeight: 500, padding: '3px 8px',
                borderRadius: 20, color: s.color, background: s.bg,
              }}>
                {s.label}
              </span>
            </UITooltip>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {hasPermWarning && (
            <UITooltip title="Requires permissions">
              <UIIcon name="WarningOutlined" style={{ fontSize: 13, color: 'var(--warning)' }} />
            </UITooltip>
          )}
          {hovered && (
            <UIButton
              size="small"
              style={{ fontSize: 12, height: 26, padding: '0 10px' }}
              onClick={e => { e.stopPropagation(); onClick(); }}
            >
              Open
            </UIButton>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ color, bg, children }: { color: string; bg: string; children: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 9px',
      borderRadius: 20, color, background: bg,
      letterSpacing: '0.01em',
    }}>
      {children}
    </span>
  );
}

function stringToColor(str: string): string {
  const colors = [
    '#6366f1', '#0c66ff', '#10b981', '#8b5cf6',
    '#f59e0b', '#ef4444', '#06b6d4', '#ec4899',
    '#84cc16', '#f97316',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length]!;
}

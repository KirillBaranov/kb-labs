import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UIInputSearch,
  UISpin,
  UIEmptyState,
  UIMessage,
  UIButton,
  UIIcon,
  UIRow,
  UICol,
  UIPage,
  UIPageHeader,
} from '@kb-labs/studio-ui-kit';
import { useDataSources } from '@/providers/data-sources-provider';
import type { PluginManifestEntry } from '@kb-labs/studio-data-client';
import { MarketplaceCard } from '../components/marketplace-card';

type KindFilter = 'all' | 'plugins' | 'adapters';
type SurfaceFilter = 'all' | 'cli' | 'studio' | 'rest';

export function PluginsPage() {
  const navigate = useNavigate();
  const { plugins: pluginsSource } = useDataSources();

  const [loading, setLoading] = useState(true);
  const [plugins, setPlugins] = useState<PluginManifestEntry[]>([]);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>('all');

  const loadPlugins = useCallback(async () => {
    try {
      setLoading(true);
      const result = await pluginsSource.getPlugins();
      setPlugins(result.manifests);
    } catch {
      UIMessage.error('Failed to load marketplace');
    } finally {
      setLoading(false);
    }
  }, [pluginsSource]);

  useEffect(() => { loadPlugins(); }, [loadPlugins]);

  const counts = useMemo(() => ({
    all: plugins.length,
    plugins: plugins.length,
    adapters: 0,
    cli: plugins.filter(p => (p.manifest.cli?.commands?.length ?? 0) > 0).length,
    studio: plugins.filter(p => (p.manifest.studio?.pages?.length ?? 0) > 0).length,
    rest: plugins.filter(p => (p.manifest.rest?.routes?.length ?? 0) > 0).length,
  }), [plugins]);

  const filtered = useMemo(() => {
    return plugins.filter(p => {
      const m = p.manifest;
      if (search) {
        const q = search.toLowerCase();
        const text = [m.id, m.display?.name, m.display?.description, ...(m.display?.tags ?? [])].join(' ').toLowerCase();
        if (!text.includes(q)) {return false;}
      }
      if (surfaceFilter === 'cli' && !((m.cli?.commands?.length ?? 0) > 0)) {return false;}
      if (surfaceFilter === 'studio' && !((m.studio?.pages?.length ?? 0) > 0)) {return false;}
      if (surfaceFilter === 'rest' && !((m.rest?.routes?.length ?? 0) > 0)) {return false;}
      return true;
    });
  }, [plugins, search, surfaceFilter]);

  const handleClick = (plugin: PluginManifestEntry) => {
    navigate(`/marketplace/${encodeURIComponent(plugin.pluginId)}`);
  };

  const kindTabs: { key: KindFilter; label: string; count: number }[] = [
    { key: 'all',      label: 'All',      count: counts.all },
    { key: 'plugins',  label: 'Extensions',  count: counts.plugins },
    { key: 'adapters', label: 'Adapters', count: counts.adapters },
  ];

  const surfaceChips: { key: SurfaceFilter; label: string; count: number }[] = [
    { key: 'cli',    label: 'CLI',       count: counts.cli },
    { key: 'studio', label: 'Studio UI', count: counts.studio },
    { key: 'rest',   label: 'REST API',  count: counts.rest },
  ];

  if (loading) {
    return (
      <UIPage width="full">
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <UISpin size="large" />
        </div>
      </UIPage>
    );
  }

  return (
    <UIPage width="full">
      <UIPageHeader
        title="Marketplace"
        description={`${counts.all} extension${counts.all !== 1 ? 's' : ''} installed`}
        actions={
          <UIButton variant="primary" icon={<UIIcon name="PlusOutlined" />}>
            Install Extension
          </UIButton>
        }
      />

      {/* Filters bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>

        {/* Kind tabs */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-tertiary)', borderRadius: 10, padding: 3 }}>
          {kindTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setKindFilter(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: kindFilter === tab.key ? 'var(--bg-secondary)' : 'transparent',
                color: kindFilter === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: kindFilter === tab.key ? 600 : 400,
                boxShadow: kindFilter === tab.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 120ms ease',
              }}
            >
              {tab.label}
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: kindFilter === tab.key ? 'var(--link)' : 'var(--text-tertiary)',
                background: kindFilter === tab.key ? 'rgba(12,102,255,0.10)' : 'transparent',
                borderRadius: 8, padding: '0 5px',
              }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'var(--border-primary)', flexShrink: 0 }} />

        {/* Surface chips */}
        <div style={{ display: 'flex', gap: 6 }}>
          {surfaceChips.map(chip => {
            const active = surfaceFilter === chip.key;
            return (
              <button
                key={chip.key}
                onClick={() => setSurfaceFilter(active ? 'all' : chip.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 20,
                  border: `1px solid ${active ? 'var(--link)' : 'var(--border-primary)'}`,
                  cursor: 'pointer',
                  background: active ? 'rgba(12,102,255,0.08)' : 'transparent',
                  color: active ? 'var(--link)' : 'var(--text-secondary)',
                  fontSize: 13, fontWeight: active ? 500 : 400,
                  transition: 'all 120ms ease',
                }}
              >
                {chip.label}
                <span style={{ fontSize: 11, color: active ? 'var(--link)' : 'var(--text-tertiary)' }}>
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search — pushed to the right */}
        <div style={{ marginLeft: 'auto' }}>
          <UIInputSearch
            placeholder="Search extensions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 260 }}
          />
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <UIEmptyState
          description={search ? 'No extensions match your search' : 'No extensions found'}
          style={{ marginTop: 48 }}
        />
      ) : (
        <UIRow gutter={[16, 16]}>
          {filtered.map(plugin => (
            <UICol key={plugin.pluginId} xs={24} sm={12} xl={8}>
              <MarketplaceCard plugin={plugin} onClick={() => handleClick(plugin)} />
            </UICol>
          ))}
        </UIRow>
      )}
    </UIPage>
  );
}

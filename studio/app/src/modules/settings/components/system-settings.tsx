import * as React from 'react';
import {
  UISpace,
  UITabs,
  UIRow,
  UICol,
  UITypographyText,
  UITypographyParagraph,
  UITag,
  UIButton,
  UIMessage,
  UIAlert,
  UIAccordion,
  UICard,
  UIDescriptions,
  UIDescriptionsItem,
  UIIcon,
  UIList,
  UIListItem,
  UIListItemMeta,
  UISkeleton,
  UIStack,
} from '@kb-labs/studio-ui-kit';
import { useDataSources } from '@/providers/data-sources-provider';
import { useHealthStatus, usePlatformConfig } from '@kb-labs/studio-data-client';
import { HealthIndicator } from '@/components/health-indicator';
import { useRegistryV2 } from '@/providers/registry-v2-provider';
import { formatTimestamp } from '@/utils/format-date';

export function SystemSettings() {
  const sources = useDataSources();

  // Status section
  const { data: healthData, isLoading: healthLoading } = useHealthStatus(sources.system);
  const { registry } = useRegistryV2();
  const registryMeta = {
    generatedAt: registry.generatedAt,
    rev: null as string | null,
    partial: false,
    stale: false,
    expiresAt: undefined as string | undefined,
    ttlMs: undefined as number | undefined,
    checksum: undefined as string | undefined,
  };

  // Platform / Adapters sections
  const { data, isLoading: platformLoading, error } = usePlatformConfig(sources.platform);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    UIMessage.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const countAdapters = (items: Array<[string, unknown]>): number => {
    return items.reduce((count, [, packageName]) => {
      if (typeof packageName === 'object' && packageName !== null && !Array.isArray(packageName)) {
        return count + Object.keys(packageName).length;
      }
      return count + 1;
    }, 0);
  };

  const adaptersArray = data ? Object.entries(data.adapters || {}) : [];
  const totalAdaptersCount = countAdapters(adaptersArray);
  const activeAdaptersCount = adaptersArray.reduce((count, [, packageName]) => {
    if (typeof packageName === 'object' && packageName !== null && !Array.isArray(packageName)) {
      return count + Object.values(packageName).filter((pkg) => pkg !== null).length;
    }
    return count + (packageName !== null ? 1 : 0);
  }, 0);

  const categories = [
    { name: 'AI & Intelligence', icon: <UIIcon name="BulbOutlined" />, color: 'purple', adapters: ['llm', 'embeddings', 'vectorStore'] },
    { name: 'Database', icon: <UIIcon name="DatabaseOutlined" />, color: 'blue', adapters: ['database', 'db', 'documentDb'] },
    { name: 'Infrastructure', icon: <UIIcon name="CloudOutlined" />, color: 'green', adapters: ['storage', 'cache'] },
    { name: 'Observability', icon: <UIIcon name="ThunderboltOutlined" />, color: 'orange', adapters: ['logger', 'analytics', 'logRingBuffer', 'logPersistence'] },
  ];

  const groupedAdapters = categories.map((category) => {
    const items = adaptersArray.filter(([name]) => category.adapters.includes(name));
    return { ...category, items, count: countAdapters(items) };
  });

  const hasRedacted = data?.redacted && data.redacted.length > 0;

  const platformStatusContent = platformLoading ? (
    <UIStack>
      <UISkeleton active lines={5} />
    </UIStack>
  ) : error ? (
    <UIAlert
      message="Failed to load platform configuration"
      description={
        <UISpace direction="vertical" size="small">
          <UITypographyText>{error instanceof Error ? error.message : 'Unknown error'}</UITypographyText>
          <UITypographyText type="secondary" style={{ fontSize: '0.875rem' }}>
            Make sure the REST API server is running and accessible.
          </UITypographyText>
        </UISpace>
      }
      variant="error"
      showIcon
    />
  ) : !data ? (
    <UITypographyParagraph type="secondary">No platform configuration available</UITypographyParagraph>
  ) : null;

  const overviewContent = (
    <UISpace direction="vertical" size="middle" style={{ width: '100%' }}>
      {data && (
        <UICard size="small" title="System Information">
          <UIDescriptions column={{ xs: 1, sm: 2 }} size="small">
            <UIDescriptionsItem label="Execution Mode">
              <UITag color="blue" icon={<UIIcon name="RocketOutlined" />}>
                {data.execution.mode}
              </UITag>
            </UIDescriptionsItem>
            <UIDescriptionsItem label="Total Adapters">
              <UISpace size={4}>
                <UITypographyText>{totalAdaptersCount}</UITypographyText>
                <UITypographyText type="secondary">({activeAdaptersCount} active)</UITypographyText>
              </UISpace>
            </UIDescriptionsItem>
          </UIDescriptions>
        </UICard>
      )}

      <UIRow gutter={[16, 16]}>
        <UICol xs={24} md={12}>
          <UICard size="small" title="Data Sources Health" style={{ height: '100%' }}>
            {healthLoading ? (
              <UIStack>
                <UISkeleton active lines={3} />
              </UIStack>
            ) : healthData ? (
              <UIList
                dataSource={healthData.sources}
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
              <UITypographyParagraph type="secondary">No health data available</UITypographyParagraph>
            )}
          </UICard>
        </UICol>

        <UICol xs={24} md={12}>
          <UICard size="small" title="Registry Status" style={{ height: '100%' }}>
            <UIDescriptions column={1} size="small">
              <UIDescriptionsItem label="Revision">{registryMeta.rev ?? 'N/A'}</UIDescriptionsItem>
              <UIDescriptionsItem label="Generated At">{formatTimestamp(registryMeta.generatedAt)}</UIDescriptionsItem>
              <UIDescriptionsItem label="Expires At">{formatTimestamp(registryMeta.expiresAt)}</UIDescriptionsItem>
              <UIDescriptionsItem label="TTL">
                {registryMeta.ttlMs ? `${registryMeta.ttlMs / 1000}s` : 'N/A'}
              </UIDescriptionsItem>
              <UIDescriptionsItem label="Partial">
                <UITypographyText type={registryMeta.partial ? 'warning' : 'success'}>
                  {registryMeta.partial ? 'Yes' : 'No'}
                </UITypographyText>
              </UIDescriptionsItem>
              <UIDescriptionsItem label="Stale">
                <UITypographyText type={registryMeta.stale ? 'danger' : 'success'}>
                  {registryMeta.stale ? 'Yes' : 'No'}
                </UITypographyText>
              </UIDescriptionsItem>
              {registryMeta.checksum && (
                <UIDescriptionsItem label="Checksum">
                  <UITypographyText code style={{ fontSize: '0.85rem' }}>
                    {registryMeta.checksum.substring(0, 8)}...
                  </UITypographyText>
                </UIDescriptionsItem>
              )}
            </UIDescriptions>
          </UICard>
        </UICol>
      </UIRow>

      {!data && platformStatusContent}
    </UISpace>
  );

  const adaptersContent = data ? (
    <>
      <UITypographyParagraph type="secondary" style={{ marginTop: 0 }}>
        Adapters are organized by category for better clarity.
      </UITypographyParagraph>

      <UISpace direction="vertical" size="middle" style={{ width: '100%' }}>
        {groupedAdapters.map((category) => (
              <UICard
                key={category.name}
                size="small"
                title={
                  <UISpace>
                    <span style={{ fontSize: '1.1rem', color: `var(--ant-${category.color}-6)` }}>
                      {category.icon}
                    </span>
                    <UITypographyText strong>{category.name}</UITypographyText>
                    <UITag color={category.color}>{category.count}</UITag>
                  </UISpace>
                }
              >
                <UISpace direction="vertical" size="small" style={{ width: '100%' }}>
                  {category.items.map(([name, packageName]) => {
                    const renderAdapterItem = (itemName: string, itemPackage: string, itemKey: string) => {
                      const isEnabled = itemPackage !== null;
                      return (
                        <div
                          key={itemKey}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: 'var(--kb-bg-secondary)',
                            borderRadius: 4,
                            borderLeft: isEnabled
                              ? `3px solid var(--ant-${category.color}-6)`
                              : '3px solid var(--ant-border-color)',
                          }}
                        >
                          <UISpace style={{ flex: 1, minWidth: 0 }}>
                            <UITypographyText strong style={{ minWidth: 100 }}>
                              {itemName}
                            </UITypographyText>
                            <UITypographyText
                              code
                              style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              {itemPackage || 'null'}
                            </UITypographyText>
                          </UISpace>
                          <UISpace>
                            {isEnabled ? (
                              <>
                                <UIIcon name="CheckCircleOutlined" style={{ color: 'var(--ant-success-color)' }} />
                                <UIButton
                                  size="small"
                                  variant="text"
                                  icon={copiedKey === itemKey ? <UIIcon name="CheckOutlined" /> : <UIIcon name="CopyOutlined" />}
                                  onClick={() => handleCopy(itemPackage, itemKey)}
                                >
                                  {copiedKey === itemKey ? 'Copied' : 'Copy'}
                                </UIButton>
                              </>
                            ) : (
                              <UIIcon name="CloseCircleOutlined" style={{ color: 'var(--ant-text-secondary)' }} />
                            )}
                          </UISpace>
                        </div>
                      );
                    };

                    if (typeof packageName === 'object' && packageName !== null && !Array.isArray(packageName)) {
                      return (
                        <UISpace key={name} direction="vertical" size="small" style={{ width: '100%' }}>
                          {Object.entries(packageName as Record<string, string>).map(([subName, subPackage]) =>
                            renderAdapterItem(subName, subPackage, `${name}.${subName}`)
                          )}
                        </UISpace>
                      );
                    }
                    return renderAdapterItem(name, packageName as string, name);
                  })}
                </UISpace>
              </UICard>
            ))}
          </UISpace>
    </>
  ) : (
    platformStatusContent
  );

  const hasAdapterOptions = !!data?.adapterOptions && Object.keys(data.adapterOptions).length > 0;

  const configContent = data ? (
    <UISpace direction="vertical" size="large" style={{ width: '100%' }}>
      {hasAdapterOptions && (
        <div>
          <UITypographyParagraph type="secondary" style={{ marginTop: 0 }}>
            Detailed configuration options for each adapter.
            {hasRedacted && (
              <UITypographyText type="warning" style={{ marginLeft: 8 }}>
                Some sensitive values have been redacted for security.
              </UITypographyText>
            )}
          </UITypographyParagraph>

          <UIAccordion
            accordion
            items={Object.entries(data.adapterOptions ?? {}).map(([adapterName, options]) => {
              const optionsCount = options ? Object.keys(options as object).length : 0;
              return {
                key: adapterName,
                label: options ? `${adapterName} (${optionsCount} option${optionsCount !== 1 ? 's' : ''})` : adapterName,
                children: options ? (
                  <pre
                    style={{
                      background: 'var(--kb-bg-secondary)',
                      padding: 12,
                      borderRadius: 4,
                      fontSize: '0.85rem',
                      overflow: 'auto',
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(options, null, 2)}
                  </pre>
                ) : (
                  <UITypographyText type="secondary">No options configured</UITypographyText>
                ),
              };
            })}
          />
        </div>
      )}

      {hasRedacted && (
        <UIAlert
          variant="warning"
          showIcon
          message="Security Notice"
          description={
            <UISpace direction="vertical" size="small">
              <UITypographyText>
                The following sensitive fields were redacted from the configuration:
              </UITypographyText>
              <UISpace wrap>
                {(data?.redacted ?? []).map((field) => (
                  <UITag key={field} color="orange">
                    {field}
                  </UITag>
                ))}
              </UISpace>
            </UISpace>
          }
        />
      )}
    </UISpace>
  ) : (
    platformStatusContent
  );

  return (
    <UITabs
      size="small"
      defaultActiveKey="overview"
      items={[
        { key: 'overview', label: 'Overview', children: overviewContent },
        { key: 'adapters', label: 'Adapters', children: adaptersContent },
        { key: 'config', label: 'Configuration', children: configContent },
      ]}
    />
  );
}

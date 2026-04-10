/**
 * @module studio/modules/settings/components/configuration-settings
 * Platform configuration settings component
 */

import * as React from 'react';
import {
  UISpace,
  UITypographyText,
  UITitle,
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
} from '@kb-labs/studio-ui-kit';
import { useDataSources } from '@/providers/data-sources-provider';
import { usePlatformConfig } from '@kb-labs/studio-data-client';
import { UISkeleton, UIStack } from '@kb-labs/studio-ui-kit';

export function ConfigurationSettings() {
  const sources = useDataSources();
  const { data, isLoading, error } = usePlatformConfig(sources.platform);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    UIMessage.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (isLoading) {
    return (
      <UIStack>
        <UISkeleton active lines={5} />
      </UIStack>
    );
  }

  if (error) {
    return (
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
    );
  }

  if (!data) {
    return (
      <div>
        <UITypographyParagraph type="secondary">No platform configuration available</UITypographyParagraph>
      </div>
    );
  }

  const adaptersArray = Object.entries(data.adapters || {});
  const hasRedacted = data.redacted && data.redacted.length > 0;

  // Helper to count adapters including nested ones
  const countAdapters = (items: Array<[string, unknown]>): number => {
    return items.reduce((count, [, packageName]) => {
      // If it's an object (nested adapters), count its children
      if (typeof packageName === 'object' && packageName !== null && !Array.isArray(packageName)) {
        return count + Object.keys(packageName).length;
      }
      // Otherwise it's a single adapter
      return count + 1;
    }, 0);
  };

  // Count total adapters (including nested)
  const totalAdaptersCount = countAdapters(adaptersArray);

  // Count active adapters (non-null packages, including nested)
  const activeAdaptersCount = adaptersArray.reduce((count, [, packageName]) => {
    if (typeof packageName === 'object' && packageName !== null && !Array.isArray(packageName)) {
      // Count non-null nested adapters
      return count + Object.values(packageName).filter(pkg => pkg !== null).length;
    }
    return count + (packageName !== null ? 1 : 0);
  }, 0);

  // Adapter categories
  const categories = [
    {
      name: 'AI & Intelligence',
      icon: <UIIcon name="BulbOutlined" />,
      color: 'purple',
      adapters: ['llm', 'embeddings', 'vectorStore'],
    },
    {
      name: 'Database',
      icon: <UIIcon name="DatabaseOutlined" />,
      color: 'blue',
      adapters: ['database', 'db', 'documentDb'],
    },
    {
      name: 'Infrastructure',
      icon: <UIIcon name="CloudOutlined" />,
      color: 'green',
      adapters: ['storage', 'cache'],
    },
    {
      name: 'Observability',
      icon: <UIIcon name="ThunderboltOutlined" />,
      color: 'orange',
      adapters: ['logger', 'analytics', 'logRingBuffer', 'logPersistence'],
    },
  ];

  // Group adapters by category
  const groupedAdapters = categories.map((category) => {
    const items = adaptersArray.filter(([name]) => category.adapters.includes(name));
    return {
      ...category,
      items,
      count: countAdapters(items),
    };
  });

  return (
    <UISpace direction="vertical" size="large" style={{ width: '100%' }}>
      {/* System Information */}
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
              <UITypographyText type="secondary">
                ({activeAdaptersCount} active)
              </UITypographyText>
            </UISpace>
          </UIDescriptionsItem>
        </UIDescriptions>
      </UICard>

      {/* Platform Adapters by Category */}
      <div>
        <UITitle level={4}>Platform Adapters</UITitle>
        <UITypographyParagraph type="secondary">
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
                  // Helper to render a single adapter item
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
                          borderLeft: isEnabled ? `3px solid var(--ant-${category.color}-6)` : '3px solid var(--ant-border-color)',
                        }}
                      >
                        <UISpace style={{ flex: 1, minWidth: 0 }}>
                          <UITypographyText strong style={{ minWidth: 100 }}>{itemName}</UITypographyText>
                          <UITypographyText
                            code
                            style={{
                              fontSize: '0.85rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
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

                  // Handle nested adapters (object with sub-adapters)
                  if (typeof packageName === 'object' && packageName !== null && !Array.isArray(packageName)) {
                    return (
                      <UISpace key={name} direction="vertical" size="small" style={{ width: '100%' }}>
                        {Object.entries(packageName as Record<string, string>).map(([subName, subPackage]) =>
                          renderAdapterItem(subName, subPackage, `${name}.${subName}`)
                        )}
                      </UISpace>
                    );
                  }

                  // Regular adapter (string package name)
                  return renderAdapterItem(name, packageName as string, name);
                })}
              </UISpace>
            </UICard>
          ))}
        </UISpace>
      </div>

      {/* Adapter Configuration */}
      {data.adapterOptions && Object.keys(data.adapterOptions).length > 0 && (
        <div>
          <UITitle level={4}>Adapter Configuration</UITitle>
          <UITypographyParagraph type="secondary">
            Detailed configuration options for each adapter.
            {hasRedacted && (
              <UITypographyText type="warning" style={{ marginLeft: 8 }}>
                Some sensitive values have been redacted for security.
              </UITypographyText>
            )}
          </UITypographyParagraph>

          <UIAccordion
            accordion
            items={Object.entries(data.adapterOptions).map(([adapterName, options]) => {
              // Find category for this adapter
              const category = categories.find((cat) => cat.adapters.includes(adapterName));
              const _categoryColor = category?.color || 'blue';

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

      {/* Redacted Fields Info */}
      {hasRedacted && (
        <UIAlert
          variant="warning"
          showIcon
          message="Security Notice"
          description={
            <UISpace direction="vertical" size="small">
              <UITypographyText>The following sensitive fields were redacted from the configuration:</UITypographyText>
              <UISpace wrap>
                {data.redacted.map((field) => (
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
  );
}

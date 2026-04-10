/**
 * Panel showing errors grouped by pattern (ESLint rules, TS codes, etc.)
 * Helps identify the most impactful errors to fix first.
 */

import * as React from 'react';
import {
  UICard,
  UITable,
  UITag,
  UITypographyText,
  UISpace,
  UIBadge,
  UISpin,
  UIIcon,
  useData,
  useTheme,
} from '@kb-labs/sdk/studio';
import type { QAErrorGroupsResponse } from '@kb-labs/qa-contracts';

const CHECK_TYPE_CONFIG: Record<string, { color: string; iconName: string; label: string }> = {
  build: { color: 'red', iconName: 'BugOutlined', label: 'Build' },
  lint: { color: 'orange', iconName: 'FileSearchOutlined', label: 'Lint' },
  typeCheck: { color: 'blue', iconName: 'FileTextOutlined', label: 'Types' },
  test: { color: 'purple', iconName: 'ExperimentOutlined', label: 'Tests' },
};

export function ErrorGroupsPanel() {
  const { antdToken: token } = useTheme();
  const { data, isLoading } = useData<QAErrorGroupsResponse>('/v1/plugins/qa/errors/groups');

  if (isLoading) {
    return <UISpin size="large" style={{ display: 'block', margin: '48px auto' }} />;
  }

  if (!data || (data.groups.length === 0 && data.ungrouped === 0)) {
    return null;
  }

  const columns = [
    {
      title: 'Pattern',
      dataIndex: 'pattern',
      key: 'pattern',
      render: (pattern: string) => (
        <UITypographyText code style={{ fontSize: token.fontSizeSM }}>{pattern}</UITypographyText>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'checkType',
      key: 'checkType',
      width: 100,
      filters: Object.entries(CHECK_TYPE_CONFIG).map(([key, cfg]) => ({
        text: cfg.label,
        value: key,
      })),
      onFilter: (value: unknown, record: { checkType: string }) => record.checkType === value,
      render: (ct: string) => {
        const cfg = CHECK_TYPE_CONFIG[ct];
        return cfg ? (
          <UITag color={cfg.color} icon={<UIIcon name={cfg.iconName} />}>{cfg.label}</UITag>
        ) : (
          <UITag>{ct}</UITag>
        );
      },
    },
    {
      title: 'Affected',
      dataIndex: 'count',
      key: 'count',
      width: 100,
      sorter: (a: { count: number }, b: { count: number }) => a.count - b.count,
      defaultSortOrder: 'descend' as const,
      render: (count: number) => (
        <UIBadge count={count} style={{ backgroundColor: count > 5 ? token.colorError : count > 2 ? token.colorWarning : token.colorSuccess }} />
      ),
    },
    {
      title: 'Packages',
      dataIndex: 'packages',
      key: 'packages',
      render: (packages: string[]) => (
        <UISpace wrap size={[4, 4]}>
          {packages.slice(0, 3).map((pkg) => (
            <UITag key={pkg} style={{ fontSize: token.fontSizeSM }}>{pkg}</UITag>
          ))}
          {packages.length > 3 && (
            <UITypographyText type="secondary" style={{ fontSize: token.fontSizeSM }}>
              +{packages.length - 3} more
            </UITypographyText>
          )}
        </UISpace>
      ),
    },
  ];

  const expandedRowRender = (record: { example?: string; packages: string[] }) => (
    <div>
      <UITypographyText type="secondary" style={{ fontSize: token.fontSizeSM }}>Example:</UITypographyText>
      <pre style={{
        background: token.colorFillTertiary,
        color: token.colorText,
        padding: token.paddingXS,
        borderRadius: token.borderRadiusSM,
        fontSize: token.fontSizeSM,
        maxHeight: 150,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        marginTop: token.marginXXS,
      }}>
        {record.example}
      </pre>
      {record.packages.length > 3 && (
        <div style={{ marginTop: token.marginXS }}>
          <UITypographyText type="secondary" style={{ fontSize: token.fontSizeSM }}>All affected packages:</UITypographyText>
          <div style={{ marginTop: token.marginXXS }}>
            <UISpace wrap size={[4, 4]}>
              {record.packages.map((pkg: string) => (
                <UITag key={pkg} style={{ fontSize: token.fontSizeSM }}>{pkg}</UITag>
              ))}
            </UISpace>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <UICard
      title={
        <UISpace>
          <UIIcon name="BugOutlined" />
          <span>Error Groups</span>
          <UITag>{data.groups.length} patterns</UITag>
          {data.ungrouped > 0 && (
            <UITag color="default">{data.ungrouped} unique errors</UITag>
          )}
        </UISpace>
      }
    >
      <UITable
        dataSource={data.groups}
        columns={columns}
        rowKey="pattern"
        size="small"
        pagination={{ pageSize: 10 }}
        expandable={{
          expandedRowRender,
          rowExpandable: () => true,
        }}
      />
    </UICard>
  );
}

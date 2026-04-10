/**
 * History tab - table of past QA runs with expandable failure details
 */

import * as React from 'react';
import { UITable, UITag, UISpin, UIAlert, UISpace, UIIcon, UIFlex, useData, useTheme, type UITableColumn } from '@kb-labs/sdk/studio';
import type { QAHistoryResponse, HistoryEntry } from '@kb-labs/qa-contracts';
import { formatCheckLabel } from '../utils/check-display';

function renderCheckColumn(entry: HistoryEntry, checkType: string) {
  const s = entry.summary[checkType];
  if (!s) {return '-';}
  const hasFailed = s.failed > 0;
  return (
    <UITag color={hasFailed ? 'error' : 'success'} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {s.passed}/{s.passed + s.failed}
    </UITag>
  );
}

export function HistoryTab() {
  const { antdToken: token } = useTheme();
  const { data, isLoading } = useData<QAHistoryResponse>('/v1/plugins/qa/history');

  if (isLoading) {
    return <UISpin size="large" style={{ display: 'block', margin: '48px auto' }} />;
  }

  if (!data || data.entries.length === 0) {
    return (
      <UIAlert
        variant="info"
        showIcon
        message="No QA history"
        description="Run 'pnpm qa:save' to record QA results to history."
      />
    );
  }

  const columns: UITableColumn<HistoryEntry>[] = [
    {
      title: 'Date',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (ts: string) => new Date(ts).toLocaleString(),
      sorter: (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <UITag
          color={status === 'passed' ? 'success' : 'error'}
          icon={status === 'passed' ? <UIIcon name="CheckCircleOutlined" /> : <UIIcon name="CloseCircleOutlined" />}
        >
          {status.toUpperCase()}
        </UITag>
      ),
      filters: [
        { text: 'Passed', value: 'passed' },
        { text: 'Failed', value: 'failed' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Git',
      key: 'git',
      width: 220,
      render: (_, record) => (
        <UISpace direction="vertical" size={0}>
          <span><UIIcon name="BranchesOutlined" /> {record.git.branch}</span>
          <span style={{ color: token.colorTextSecondary, fontSize: token.fontSizeSM }}>
            {record.git.commit.slice(0, 7)} - {record.git.message.slice(0, 40)}
            {record.git.message.length > 40 ? '...' : ''}
          </span>
        </UISpace>
      ),
    },
    ...(data.entries[0] ? Object.keys(data.entries[0].summary) : []).map((ct) => ({
      title: formatCheckLabel(ct),
      key: ct,
      width: 90,
      align: 'center' as const,
      render: (_: unknown, record: HistoryEntry) => renderCheckColumn(record, ct),
    })),
  ];

  return (
    <UITable<HistoryEntry>
      columns={columns}
      dataSource={data.entries}
      rowKey="timestamp"
      pagination={{ pageSize: 15 }}
      size="middle"
      expandable={{
        expandedRowRender: (record) => (
          <div style={{ padding: `${token.paddingXS}px ${token.paddingMD}px` }}>
            {Object.keys(record.failedPackages).map((ct) => {
              const failed = record.failedPackages[ct];
              if (!failed || failed.length === 0) {return null;}
              return (
                <div key={ct} style={{ marginBottom: token.marginSM }}>
                  <strong>{formatCheckLabel(ct)} failures ({failed.length}):</strong>
                  <UIFlex wrap="wrap" gap={1} style={{ marginTop: token.marginXXS }}>
                    {failed.map((pkg) => (
                      <UITag key={pkg} color="error" style={{ fontSize: token.fontSizeSM }}>{pkg}</UITag>
                    ))}
                  </UIFlex>
                </div>
              );
            })}
          </div>
        ),
        rowExpandable: (record) =>
          Object.values(record.failedPackages).some((arr) => arr.length > 0),
      }}
    />
  );
}

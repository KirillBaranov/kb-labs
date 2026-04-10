/**
 * Drawer showing per-package details for a specific check type.
 * Opens when a check card is clicked on the overview tab.
 */

import * as React from 'react';
import {
  UIDrawer,
  UITable,
  UITag,
  UIInput,
  UISpace,
  UITypographyText,
  UIButton,
  UIMessage,
  UIAccordion,
  UIIcon,
  useData,
  useMutateData,
  useTheme,
} from '@kb-labs/sdk/studio';
import type { QADetailsResponse, QARunCheckRequest, QARunCheckResponse } from '@kb-labs/qa-contracts';

interface CheckDetailDrawerProps {
  open: boolean;
  checkType: string | null;
  checkLabel: string;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { color: string; iconName: string }> = {
  passed: { color: 'success', iconName: 'CheckCircleOutlined' },
  failed: { color: 'error', iconName: 'CloseCircleOutlined' },
  skipped: { color: 'default', iconName: 'MinusCircleOutlined' },
};

export function CheckDetailDrawer({ open, checkType, checkLabel, onClose }: CheckDetailDrawerProps) {
  const { antdToken: token } = useTheme();
  const { data: details, isLoading } = useData<QADetailsResponse>('/v1/plugins/qa/details');
  const { mutateAsync: runCheck, isLoading: isRunning } = useMutateData<QARunCheckRequest, QARunCheckResponse>(
    '/v1/plugins/qa/run/check',
    'POST',
  );
  const [search, setSearch] = React.useState('');

  if (!checkType) { return null; }

  const checkData = details?.checks[checkType];

  const allPackages = [
    ...(checkData?.failed ?? []).map((p) => ({ ...p, status: 'failed' as const })),
    ...(checkData?.passed ?? []).map((p) => ({ ...p, status: 'passed' as const })),
    ...(checkData?.skipped ?? []).map((p) => ({ ...p, status: 'skipped' as const })),
  ].filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.repo.toLowerCase().includes(search.toLowerCase()),
  );

  const handleRunCheck = async () => {
    void UIMessage.loading(`Running ${checkLabel}...`, 0);
    try {
      const data = await runCheck({ checkType: checkType as 'lint' | 'typeCheck' | 'test' });
      UIMessage.destroy();
      if (data.status === 'passed') {
        UIMessage.success(`${checkLabel} passed in ${(data.durationMs / 1000).toFixed(1)}s`);
      } else {
        UIMessage.warning(`${checkLabel}: ${data.result.failed.length} failures in ${(data.durationMs / 1000).toFixed(1)}s`);
      }
    } catch (error) {
      UIMessage.destroy();
      UIMessage.error(`${checkLabel} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const canRerun = checkType !== 'build';

  const columns = [
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      filters: [
        { text: 'Failed', value: 'failed' },
        { text: 'Passed', value: 'passed' },
        { text: 'Skipped', value: 'skipped' },
      ],
      onFilter: (value: unknown, record: { status: string }) => record.status === value,
      render: (status: keyof typeof STATUS_CONFIG) => {
        const cfg = STATUS_CONFIG[status];
        return <UITag color={cfg?.color} icon={cfg ? <UIIcon name={cfg.iconName} /> : undefined}>{status}</UITag>;
      },
    },
    {
      title: 'Package',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name),
      render: (name: string) => (
        <UITypographyText code style={{ fontSize: token.fontSizeSM }}>{name}</UITypographyText>
      ),
    },
    {
      title: 'Repo',
      dataIndex: 'repo',
      key: 'repo',
      width: 180,
      filters: [...new Set(allPackages.map((p) => p.repo))].map((r) => ({ text: r, value: r })),
      onFilter: (value: unknown, record: { repo: string }) => record.repo === value,
      render: (repo: string) => <UITag>{repo}</UITag>,
    },
  ];

  const expandedRowRender = (record: { error?: string }) => {
    if (!record.error) { return null; }
    return (
      <UIAccordion
        ghost
        items={[{
          key: '1',
          label: 'Error output',
          children: (
            <pre style={{
              background: token.colorFillTertiary,
              color: token.colorText,
              padding: token.paddingSM,
              borderRadius: token.borderRadius,
              fontSize: token.fontSizeSM,
              maxHeight: 300,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {record.error}
            </pre>
          ),
        }]}
      />
    );
  };

  return (
    <UIDrawer
      title={
        <UISpace>
          <span>{checkLabel} Details</span>
          <UITag color={checkData?.failed.length ? 'error' : 'success'}>
            {checkData?.failed.length ?? 0} failed
          </UITag>
        </UISpace>
      }
      placement="right"
      width={720}
      open={open}
      onClose={onClose}
      extra={
        canRerun && (
          <UIButton
            variant="primary"
            icon={<UIIcon name="PlayCircleOutlined" />}
            onClick={() => void handleRunCheck()}
            loading={isRunning}
            size="small"
          >
            Re-run {checkLabel}
          </UIButton>
        )
      }
    >
      <UIInput
        placeholder="Filter by package or repo..."
        prefix={<UIIcon name="SearchOutlined" />}
        value={search}
        onChange={(value) => setSearch(value)}
        style={{ marginBottom: token.marginMD }}
        allowClear
      />

      <UITable
        dataSource={allPackages}
        columns={columns}
        rowKey="name"
        size="small"
        loading={isLoading}
        pagination={{ pageSize: 50 }}
        expandable={{
          expandedRowRender,
          rowExpandable: (record) => !!record.error,
        }}
      />
    </UIDrawer>
  );
}

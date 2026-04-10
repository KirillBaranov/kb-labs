/**
 * Drawer showing per-package QA history timeline with flaky detection.
 */

import * as React from 'react';
import {
  UIDrawer,
  UITable,
  UITag,
  UITypographyText,
  UIStatistic,
  UIRow,
  UICol,
  UISpin,
  UIAlert,
  UISpace,
  UIIcon,
  useData,
  useTheme,
} from '@kb-labs/sdk/studio';
import type { QAPackageTimelineResponse } from '@kb-labs/qa-contracts';

interface PackageTimelineDrawerProps {
  open: boolean;
  packageName: string | null;
  onClose: () => void;
}

const CHECK_STATUS_TAG: Record<string, { color: string; iconName: string }> = {
  passed: { color: 'success', iconName: 'CheckCircleOutlined' },
  failed: { color: 'error', iconName: 'CloseCircleOutlined' },
  skipped: { color: 'default', iconName: 'MinusCircleOutlined' },
};

export function PackageTimelineDrawer({ open, packageName, onClose }: PackageTimelineDrawerProps) {
  const { antdToken: token } = useTheme();
  const timelineUrl = packageName
    ? `/v1/plugins/qa/packages/${encodeURIComponent(packageName)}/timeline`
    : null;
  const { data, isLoading } = useData<QAPackageTimelineResponse>(timelineUrl ?? '');

  if (!packageName) { return null; }

  return (
    <UIDrawer
      title={
        <UISpace>
          <span>Timeline: {packageName}</span>
          {data?.flakyScore && data.flakyScore > 0.3 && (
            <UITag color="warning" icon={<UIIcon name="WarningOutlined" />}>Flaky</UITag>
          )}
        </UISpace>
      }
      placement="right"
      width={700}
      open={open}
      onClose={onClose}
    >
      {isLoading && (
        <UISpin size="large" style={{ display: 'block', margin: '48px auto' }} />
      )}

      {!isLoading && !data && (
        <UIAlert variant="info" message={`No history found for ${packageName}`} />
      )}

      {!isLoading && data && (
        <div>
          <UIRow gutter={16} style={{ marginBottom: token.marginLG }}>
            <UICol span={6}>
              <UIStatistic
                title="Repo"
                value={data.repo}
                valueStyle={{ fontSize: token.fontSize }}
              />
            </UICol>
            <UICol span={6}>
              <UIStatistic
                title="Streak"
                value={data.currentStreak.count}
                prefix={data.currentStreak.status === 'failing' ? <UIIcon name="FireOutlined" /> : <UIIcon name="CheckCircleOutlined" />}
                suffix={data.currentStreak.status}
                valueStyle={{
                  fontSize: token.fontSize,
                  color: data.currentStreak.status === 'failing' ? token.colorError : token.colorSuccess,
                }}
              />
            </UICol>
            <UICol span={6}>
              <UIStatistic
                title="Flaky Score"
                value={Math.round(data.flakyScore * 100)}
                suffix="%"
                valueStyle={{
                  fontSize: token.fontSize,
                  color: data.flakyScore > 0.3 ? token.colorWarning : token.colorSuccess,
                }}
              />
            </UICol>
            <UICol span={6}>
              {data.firstFailure && (
                <UIStatistic
                  title="First Failure"
                  value={new Date(data.firstFailure).toLocaleDateString()}
                  valueStyle={{ fontSize: token.fontSize }}
                />
              )}
            </UICol>
          </UIRow>

          {data.flakyChecks.length > 0 && (
            <UIAlert
              variant="warning"
              showIcon
              icon={<UIIcon name="WarningOutlined" />}
              message="Flaky checks detected"
              description={
                <UISpace>
                  {data.flakyChecks.map((ct) => (
                    <UITag key={ct} color="warning">{ct}</UITag>
                  ))}
                </UISpace>
              }
              style={{ marginBottom: token.marginMD }}
            />
          )}

          <UITable
            dataSource={data.entries}
            rowKey="timestamp"
            size="small"
            pagination={{ pageSize: 20 }}
            columns={[
              {
                title: 'Date',
                dataIndex: 'timestamp',
                key: 'timestamp',
                width: 160,
                render: (ts: string) => new Date(ts).toLocaleString(),
              },
              {
                title: 'Commit',
                key: 'git',
                width: 120,
                render: (_: unknown, record: { git: { commit: string }; checks: Record<string, string> }) => (
                  <UITypographyText code style={{ fontSize: token.fontSizeSM }}>
                    {record.git.commit.slice(0, 7)}
                  </UITypographyText>
                ),
              },
              {
                title: 'Build',
                key: 'build',
                width: 80,
                render: (_: unknown, record: { git: { commit: string }; checks: Record<string, string> }) => {
                  const s = record.checks.build as keyof typeof CHECK_STATUS_TAG;
                  const cfg = CHECK_STATUS_TAG[s];
                  return cfg ? <UITag color={cfg.color} icon={<UIIcon name={cfg.iconName} />}>{s}</UITag> : <UITag>{s}</UITag>;
                },
              },
              {
                title: 'Lint',
                key: 'lint',
                width: 80,
                render: (_: unknown, record: { git: { commit: string }; checks: Record<string, string> }) => {
                  const s = record.checks.lint as keyof typeof CHECK_STATUS_TAG;
                  const cfg = CHECK_STATUS_TAG[s];
                  return cfg ? <UITag color={cfg.color} icon={<UIIcon name={cfg.iconName} />}>{s}</UITag> : <UITag>{s}</UITag>;
                },
              },
              {
                title: 'Types',
                key: 'typeCheck',
                width: 80,
                render: (_: unknown, record: { git: { commit: string }; checks: Record<string, string> }) => {
                  const s = record.checks.typeCheck as keyof typeof CHECK_STATUS_TAG;
                  const cfg = CHECK_STATUS_TAG[s];
                  return cfg ? <UITag color={cfg.color} icon={<UIIcon name={cfg.iconName} />}>{s}</UITag> : <UITag>{s}</UITag>;
                },
              },
              {
                title: 'Tests',
                key: 'test',
                width: 80,
                render: (_: unknown, record: { git: { commit: string }; checks: Record<string, string> }) => {
                  const s = record.checks.test as keyof typeof CHECK_STATUS_TAG;
                  const cfg = CHECK_STATUS_TAG[s];
                  return cfg ? <UITag color={cfg.color} icon={<UIIcon name={cfg.iconName} />}>{s}</UITag> : <UITag>{s}</UITag>;
                },
              },
            ]}
          />
        </div>
      )}
    </UIDrawer>
  );
}

/**
 * Overview tab - per-check pass rates, status badge, baseline diff, error groups.
 * Check cards are clickable — opens a drawer with per-package details.
 */

import * as React from 'react';
import {
  UIRow, UICol, UICard, UIStatistic, UIProgress, UITag, UIAlert,
  UISpin, UISpace, UIButton, UIMessage, UIIcon, UICheckbox, UIPopover,
  useData, useMutateData, useTheme,
} from '@kb-labs/sdk/studio';
import { CheckDetailDrawer } from './CheckDetailDrawer';
import { BaselineDiffCard } from './BaselineDiffCard';
import { ErrorGroupsPanel } from './ErrorGroupsPanel';
import { getCheckIcon } from '../utils/check-display';
import type { QASummaryResponse, QARunResponse } from '@kb-labs/qa-contracts';
function getPassRate(passed: number, total: number, skipped: number = 0): number {
  if (total === 0) {return 100;}
  return Math.round(((passed + skipped) / total) * 100);
}

function getProgressStatus(rate: number): 'success' | 'exception' | 'normal' {
  if (rate >= 100) {return 'success';}
  if (rate < 50) {return 'exception';}
  return 'normal';
}

type AntToken = ReturnType<typeof useTheme>['antdToken'];

function getProgressColor(rate: number, token: AntToken): string {
  if (rate >= 100) {return token.colorSuccess;}
  if (rate >= 80) {return token.colorSuccess;}
  if (rate >= 60) {return token.colorWarning;}
  return token.colorError;
}

export function OverviewTab() {
  const { antdToken: token } = useTheme();
  const { data: summary, isLoading: summaryLoading } = useData<QASummaryResponse>(
    '/v1/plugins/qa/summary',
  );
  const { mutateAsync: runQA, isLoading: isRunning } = useMutateData<
    { skipChecks?: string[] },
    QARunResponse
  >('/v1/plugins/qa/run');

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedCheck, setSelectedCheck] = React.useState<{ type: string; label: string } | null>(null);
  const [skippedChecks, setSkippedChecks] = React.useState<Set<string>>(new Set());

  const toggleCheck = (id: string, enabled: boolean) => {
    setSkippedChecks(prev => {
      const next = new Set(prev);
      if (enabled) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handleCheckClick = (checkType: string, label: string) => {
    setSelectedCheck({ type: checkType, label });
    setDrawerOpen(true);
  };

  const handleRunQA = async () => {
    void UIMessage.loading('Running QA checks...', 0);
    try {
      const data = await runQA({ skipChecks: skippedChecks.size > 0 ? [...skippedChecks] : undefined });
      UIMessage.destroy();
      if (data.status === 'passed') {
        UIMessage.success(`QA passed in ${(data.durationMs / 1000).toFixed(1)}s`);
      } else {
        const totalFailed = Object.values(data.results).reduce((sum, r) => sum + r.failed.length, 0);
        UIMessage.warning(`QA finished with ${totalFailed} failures in ${(data.durationMs / 1000).toFixed(1)}s`);
      }
    } catch (error) {
      UIMessage.destroy();
      UIMessage.error(`QA run failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (summaryLoading) {
    return <UISpin size="large" style={{ display: 'block', margin: '48px auto' }} />;
  }

  if (!summary) {
    return (
      <UIAlert
        variant="info"
        showIcon
        message="No QA data"
        description="Run 'pnpm qa:save' to generate QA history."
        style={{ marginBottom: token.marginLG }}
      />
    );
  }

  const overallPassed = summary.status === 'passed';

  return (
    <div>
      {/* Run QA Button */}
      <div style={{ marginBottom: token.marginMD }}>
        <UISpace>
          <UIButton
            variant="primary"
            icon={<UIIcon name="PlayCircleOutlined" />}
            onClick={() => void handleRunQA()}
            loading={isRunning}
            disabled={isRunning}
          >
            {isRunning ? 'Running QA Checks...' : 'Run QA'}
          </UIButton>
          <UIPopover
            trigger="click"
            title="Checks to run"
            content={
              <UISpace direction="vertical">
                {(summary?.checks ?? []).map(c => (
                  <UICheckbox
                    key={c.checkType}
                    checked={!skippedChecks.has(c.checkType)}
                    onChange={(checked) => toggleCheck(c.checkType, checked)}
                  >
                    {getCheckIcon(c.checkType)}{' '}{c.label}
                  </UICheckbox>
                ))}
              </UISpace>
            }
          >
            <UIButton icon={<UIIcon name="SettingOutlined" />} disabled={isRunning} />
          </UIPopover>
        </UISpace>
      </div>

      {/* Status Banner */}
      <UIAlert
        variant={overallPassed ? 'success' : 'error'}
        showIcon
        icon={overallPassed ? <UIIcon name="CheckCircleOutlined" /> : <UIIcon name="CloseCircleOutlined" />}
        message={
          <UISpace>
            <span style={{ fontWeight: 600 }}>
              QA Status: {overallPassed ? 'All Checks Passing' : 'Checks Failing'}
            </span>
            <UITag color={overallPassed ? 'success' : 'error'}>
              {summary.status.toUpperCase()}
            </UITag>
          </UISpace>
        }
        description={
          summary.lastRunAt ? (
            <UISpace split={<span style={{ color: token.colorBorderSecondary }}>|</span>}>
              <span><UIIcon name="ClockCircleOutlined" /> {new Date(summary.lastRunAt).toLocaleString()}</span>
              {summary.git && (
                <span><UIIcon name="BranchesOutlined" /> {summary.git.branch} ({summary.git.commit.slice(0, 7)})</span>
              )}
              <span>{summary.historyCount} runs in history</span>
            </UISpace>
          ) : undefined
        }
        style={{ marginBottom: token.marginLG }}
      />

      {/* Check Cards */}
      <UIRow gutter={[16, 16]} style={{ marginBottom: token.marginLG }}>
        {summary.checks.map((check) => {
          const rate = getPassRate(check.passed, check.total, check.skipped);
          return (
            <UICol xs={24} sm={12} lg={6} key={check.checkType}>
              <UICard hoverable onClick={() => handleCheckClick(check.checkType, check.label)} style={{ cursor: 'pointer' }}>
                <div style={{ textAlign: 'center', marginBottom: token.marginMD }}>
                  <UIProgress
                    type="circle"
                    percent={rate}
                    size={120}
                    status={getProgressStatus(rate)}
                    strokeColor={getProgressColor(rate, token)}
                    format={() => `${rate}%`}
                  />
                </div>
                <div style={{ textAlign: 'center', marginBottom: token.marginXS }}>
                  <UISpace>
                    {getCheckIcon(check.checkType)}
                    <span style={{ fontWeight: 600, fontSize: token.fontSizeLG }}>{check.label}</span>
                  </UISpace>
                </div>
                <UIRow gutter={8} justify="center">
                  <UICol><UIStatistic title="Passed" value={check.passed} valueStyle={{ color: token.colorSuccess, fontSize: token.fontSize }} /></UICol>
                  <UICol>
                    <UIStatistic
                      title="Failed"
                      value={check.failed}
                      valueStyle={{ color: check.failed > 0 ? token.colorError : token.colorSuccess, fontSize: token.fontSize }}
                    />
                  </UICol>
                  {check.skipped > 0 && (
                    <UICol><UIStatistic title="Skipped" value={check.skipped} valueStyle={{ color: token.colorTextSecondary, fontSize: token.fontSize }} /></UICol>
                  )}
                </UIRow>
              </UICard>
            </UICol>
          );
        })}
      </UIRow>

      {/* Baseline Diff */}
      <div style={{ marginBottom: token.marginLG }}>
        <BaselineDiffCard />
      </div>

      {/* Error Groups */}
      <div style={{ marginBottom: token.marginLG }}>
        <ErrorGroupsPanel />
      </div>

      {/* Check Detail Drawer */}
      <CheckDetailDrawer
        open={drawerOpen}
        checkType={selectedCheck?.type ?? null}
        checkLabel={selectedCheck?.label ?? ''}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}

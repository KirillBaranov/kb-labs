import * as React from 'react';
import {
  UIRow, UICol, UICard, UIStatistic, UITag, UIAlert,
  UISpin, UISpace, UIIcon,
  useData, useTheme,
} from '@kb-labs/sdk/studio';
import { CheckDetailDrawer } from './CheckDetailDrawer';
import { BaselineDiffCard } from './BaselineDiffCard';
import { ErrorGroupsPanel } from './ErrorGroupsPanel';
import type { RunSnapshot, StatsSnapshot, BaselineData } from '@kb-labs/qa-contracts';
import { QA_BASE_PATH, QA_ROUTES } from '@kb-labs/qa-contracts';

type SummaryResponse = {
  latestRun: RunSnapshot | null;
  latestCheck: import('@kb-labs/qa-contracts').CheckSnapshot | null;
  latestStats: StatsSnapshot | null;
  baseline: BaselineData | null;
};

export function OverviewTab() {
  const { antdToken: token } = useTheme();

  const { data: summary, isLoading } = useData<SummaryResponse>(
    `${QA_BASE_PATH}${QA_ROUTES.SUMMARY}`,
  );

  const [drawerOpen, setDrawerOpen] = React.useState(false);

  if (isLoading) {
    return <UISpin size="large" style={{ display: 'block', margin: '48px auto' }} />;
  }

  if (!summary) {
    return (
      <UIAlert
        variant="info"
        showIcon
        message="No QA data"
        description="Run 'kb qa run' to generate QA history."
        style={{ marginBottom: token.marginLG }}
      />
    );
  }

  const { latestRun, latestStats } = summary;

  const stats = latestStats?.raw;
  const run = latestRun?.raw;

  // Group run results by task
  const taskGroups = new Map<string, { passed: number; failed: number; cached: number }>();
  if (run?.results) {
    for (const r of run.results) {
      const existing = taskGroups.get(r.Task) ?? { passed: 0, failed: 0, cached: 0 };
      if (r.Cached) { existing.cached += 1; }
      else if (r.OK) { existing.passed += 1; }
      else { existing.failed += 1; }
      taskGroups.set(r.Task, existing);
    }
  }

  const overallOk = run?.ok ?? null;
  const grade = stats?.grade ?? null;
  const score = stats?.score ?? null;

  return (
    <div>
      {/* Status Banner */}
      <UIAlert
        variant={overallOk === true ? 'success' : overallOk === false ? 'error' : 'info'}
        showIcon
        icon={overallOk === true
          ? <UIIcon name="CheckCircleOutlined" />
          : <UIIcon name="CloseCircleOutlined" />}
        message={
          <UISpace>
            <span style={{ fontWeight: 600 }}>
              QA Status: {overallOk === true ? 'Passing' : overallOk === false ? 'Failing' : 'No data'}
            </span>
            {grade && (
              <UITag color={grade.startsWith('A') ? 'success' : grade === 'B' ? 'warning' : 'error'}>
                Grade: {grade}
              </UITag>
            )}
            {score !== null && <UITag>Score: {score}</UITag>}
          </UISpace>
        }
        description={
          latestRun ? (
            <UISpace split={<span style={{ color: token.colorBorderSecondary }}>|</span>}>
              <span><UIIcon name="ClockCircleOutlined" /> {new Date(latestRun.timestamp).toLocaleString()}</span>
              {latestRun.git && (
                <span>
                  <UIIcon name="BranchesOutlined" /> {latestRun.git.branch} ({latestRun.git.commit.slice(0, 7)})
                </span>
              )}
              <span>tasks: {latestRun.tasks.join(', ')}</span>
            </UISpace>
          ) : undefined
        }
        style={{ marginBottom: token.marginLG }}
      />

      {/* Latest run task cards */}
      {taskGroups.size > 0 && (
        <UIRow gutter={[16, 16]} style={{ marginBottom: token.marginLG }}>
          {[...taskGroups.entries()].map(([task, counts]) => {
            const hasFailed = counts.failed > 0;
            return (
              <UICol xs={24} sm={12} lg={6} key={task}>
                <UICard
                  hoverable
                  onClick={() => setDrawerOpen(true)}
                  style={{ cursor: 'pointer', textAlign: 'center' }}
                >
                  <UITag
                    color={hasFailed ? 'error' : 'success'}
                    style={{ marginBottom: token.marginSM, fontSize: token.fontSize }}
                  >
                    {hasFailed
                      ? <UIIcon name="CloseCircleOutlined" />
                      : <UIIcon name="CheckCircleOutlined" />}
                    {' '}{hasFailed ? 'FAILED' : 'PASSED'}
                  </UITag>
                  <div style={{ fontWeight: 600, fontSize: token.fontSizeLG, marginBottom: token.marginSM }}>
                    {task}
                  </div>
                  <UIRow gutter={8} justify="center">
                    <UICol>
                      <UIStatistic
                        title="Passed"
                        value={counts.passed}
                        valueStyle={{ color: token.colorSuccess, fontSize: token.fontSize }}
                      />
                    </UICol>
                    <UICol>
                      <UIStatistic
                        title="Failed"
                        value={counts.failed}
                        valueStyle={{ color: counts.failed > 0 ? token.colorError : token.colorSuccess, fontSize: token.fontSize }}
                      />
                    </UICol>
                    {counts.cached > 0 && (
                      <UICol>
                        <UIStatistic
                          title="Cached"
                          value={counts.cached}
                          valueStyle={{ color: token.colorTextSecondary, fontSize: token.fontSize }}
                        />
                      </UICol>
                    )}
                  </UIRow>
                </UICard>
              </UICol>
            );
          })}
        </UIRow>
      )}

      {/* Baseline Diff */}
      <div style={{ marginBottom: token.marginLG }}>
        <BaselineDiffCard />
      </div>

      {/* Error Groups */}
      <div style={{ marginBottom: token.marginLG }}>
        <ErrorGroupsPanel />
      </div>

      <CheckDetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}

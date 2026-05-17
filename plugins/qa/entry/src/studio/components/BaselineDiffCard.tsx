/**
 * Baseline diff card — shows new issues, fixed issues, score delta and grade delta.
 */

import * as React from 'react';
import {
  UICard,
  UIRow,
  UICol,
  UITag,
  UITypographyText,
  UIAlert,
  UISpace,
  UIStatistic,
  UIIcon,
  UISpin,
  useData,
  useTheme,
} from '@kb-labs/sdk/studio';
import type { QABaselineDiffResponse, BaselineCheckDiff, CheckIssueDiff } from '@kb-labs/qa-contracts';
import { QA_BASE_PATH, QA_ROUTES } from '@kb-labs/qa-contracts';

function isError(data: QABaselineDiffResponse): data is { error: 'no-baseline' | 'no-check' | 'no-stats' } {
  return 'error' in data;
}

function IssueList({ issues, color }: { issues: CheckIssueDiff[]; color: 'error' | 'success' | 'warning' }) {
  const { antdToken: token } = useTheme();
  const shown = issues.slice(0, 5);
  return (
    <div>
      {shown.map((issue, idx) => (
        <div key={idx} style={{ marginBottom: token.marginXXS }}>
          <UITag color={issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'default'} style={{ fontSize: token.fontSizeSM }}>
            {issue.check}
          </UITag>
          <UITag style={{ fontSize: token.fontSizeSM }}>{issue.pkg}</UITag>
          <span style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{issue.message.slice(0, 60)}{issue.message.length > 60 ? '…' : ''}</span>
        </div>
      ))}
      {issues.length > 5 && (
        <UITypographyText type="secondary" style={{ fontSize: token.fontSizeSM }}>
          +{issues.length - 5} more
        </UITypographyText>
      )}
    </div>
  );
}

function DiffContent({ diff }: { diff: BaselineCheckDiff }) {
  const { antdToken: token } = useTheme();
  const hasNewIssues = diff.newIssueCount > 0;
  const hasFixed = diff.fixedIssueCount > 0;

  return (
    <UICard
      title={
        <UISpace>
          <UIIcon name="WarningOutlined" style={{ color: hasNewIssues ? token.colorError : token.colorSuccess }} />
          <span>Baseline Diff</span>
          {hasNewIssues && <UITag color="error">+{diff.newIssueCount} new issues</UITag>}
          {hasFixed && <UITag color="success">{diff.fixedIssueCount} fixed</UITag>}
        </UISpace>
      }
    >
      <UIRow gutter={[16, 16]}>
        {/* Score delta */}
        <UICol xs={24} sm={8}>
          <UICard size="small" style={{ textAlign: 'center' }}>
            <UITypographyText strong>Score Delta</UITypographyText>
            <div style={{ marginTop: token.marginXS }}>
              <UIStatistic
                value={Math.abs(diff.scoreDelta)}
                prefix={
                  diff.scoreDelta > 0
                    ? <UIIcon name="ArrowUpOutlined" />
                    : diff.scoreDelta < 0
                      ? <UIIcon name="ArrowDownOutlined" />
                      : null
                }
                valueStyle={{
                  color: diff.scoreDelta < 0
                    ? token.colorError
                    : diff.scoreDelta > 0
                      ? token.colorSuccess
                      : token.colorTextSecondary,
                  fontSize: token.fontSizeHeading3,
                }}
                suffix={diff.gradeDelta ? ` (${diff.gradeDelta})` : undefined}
              />
            </div>
          </UICard>
        </UICol>

        {/* New issues */}
        {diff.newIssues.length > 0 && (
          <UICol xs={24} sm={8}>
            <UICard size="small">
              <UITypographyText type="danger" strong>New Issues ({diff.newIssues.length})</UITypographyText>
              <div style={{ marginTop: token.marginXS }}>
                <IssueList issues={diff.newIssues} color="error" />
              </div>
            </UICard>
          </UICol>
        )}

        {/* Fixed issues */}
        {diff.fixedIssues.length > 0 && (
          <UICol xs={24} sm={8}>
            <UICard size="small">
              <UITypographyText type="success" strong>Fixed Issues ({diff.fixedIssues.length})</UITypographyText>
              <div style={{ marginTop: token.marginXS }}>
                <IssueList issues={diff.fixedIssues} color="success" />
              </div>
            </UICard>
          </UICol>
        )}
      </UIRow>
    </UICard>
  );
}

export function BaselineDiffCard() {
  const { data: diffData, isLoading } = useData<QABaselineDiffResponse>(`${QA_BASE_PATH}${QA_ROUTES.BASELINE_DIFF}`);

  if (isLoading) { return <UISpin size="small" style={{ display: 'block', margin: '16px auto' }} />; }

  if (!diffData) { return null; }

  if (isError(diffData)) {
    if (diffData.error === 'no-baseline') {
      return (
        <UIAlert
          variant="warning"
          showIcon
          message="No baseline set"
          description="Run QA checks and save a baseline to enable diff tracking."
        />
      );
    }
    if (diffData.error === 'no-check') {
      return (
        <UIAlert
          variant="info"
          showIcon
          message="No check snapshot"
          description="Run 'kb qa check --save' to generate a check snapshot."
        />
      );
    }
    return (
      <UIAlert
        variant="info"
        showIcon
        message="No stats snapshot"
        description="Run 'kb qa stats --save' to generate a stats snapshot."
      />
    );
  }

  const hasChanges = diffData.newIssueCount > 0 || diffData.fixedIssueCount > 0;

  if (!hasChanges) {
    return (
      <UIAlert
        variant="success"
        showIcon
        icon={<UIIcon name="CheckCircleOutlined" />}
        message="No changes since baseline"
        description={`Score delta: ${diffData.scoreDelta >= 0 ? '+' : ''}${diffData.scoreDelta}${diffData.gradeDelta ? ` (grade: ${diffData.gradeDelta})` : ''}`}
      />
    );
  }

  return <DiffContent diff={diffData} />;
}

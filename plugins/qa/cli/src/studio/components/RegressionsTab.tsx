/**
 * Regressions tab — detect and display new failures since last QA save
 */

import * as React from 'react';
import { UIAlert, UICard, UITag, UISpin, UISpace, UIEmptyState, UIIcon, UIFlex, useData, useTheme } from '@kb-labs/sdk/studio';
import { getCheckIcon, formatCheckLabel } from '../utils/check-display';
import type { QARegressionsResponse } from '@kb-labs/qa-contracts';

export function RegressionsTab() {
  const { antdToken: token } = useTheme();
  const { data, isLoading } = useData<QARegressionsResponse>('/v1/plugins/qa/regressions');

  if (isLoading) {
    return <UISpin size="large" style={{ display: 'block', margin: '48px auto' }} />;
  }

  if (!data) {
    return (
      <UIAlert
        variant="info"
        showIcon
        message="Not enough data for regression detection"
        description="Need at least 2 history entries. Run 'pnpm qa:save' multiple times."
      />
    );
  }

  if (!data.hasRegressions) {
    return (
      <div>
        <UIAlert
          variant="success"
          showIcon
          icon={<UIIcon name="CheckCircleOutlined" />}
          message="No regressions detected"
          description="All check types show the same or fewer failures compared to the previous QA run."
          style={{ marginBottom: token.marginLG }}
        />
        <UIEmptyState description="No regressions to display" />
      </div>
    );
  }

  return (
    <div>
      <UIAlert
        variant="error"
        showIcon
        icon={<UIIcon name="WarningOutlined" />}
        message={`${data.regressions.length} regression${data.regressions.length > 1 ? 's' : ''} detected`}
        description="The following check types have new failures compared to the previous QA run."
        style={{ marginBottom: token.marginLG }}
      />

      {data.regressions.map((reg, idx) => (
        <UICard
          key={idx}
          title={
            <UISpace>
              {getCheckIcon(reg.checkType)}
              <span>{formatCheckLabel(reg.checkType)}</span>
              <UITag color="error">+{reg.delta} new failure{reg.delta > 1 ? 's' : ''}</UITag>
            </UISpace>
          }
          style={{ marginBottom: token.marginMD }}
        >
          <div>
            <strong>New failures:</strong>
            <UIFlex wrap="wrap" gap={1} style={{ marginTop: token.marginXS }}>
              {reg.newFailures.map((pkg) => (
                <UITag key={pkg} color="error">
                  {pkg}
                </UITag>
              ))}
            </UIFlex>
          </div>
        </UICard>
      ))}

      <UIAlert
        variant="warning"
        showIcon
        message="Action required"
        description={
          <div>
            <p>Fix the regressions above before merging. Recommendations:</p>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              <li>Run <code>pnpm qa --json</code> to see detailed error messages</li>
              <li>Fix the failing packages</li>
              <li>Re-run <code>pnpm qa:save</code> to verify fixes</li>
              <li>Update baseline if needed: <code>pnpm kb baseline:update</code></li>
            </ol>
          </div>
        }
        style={{ marginTop: token.marginMD }}
      />
    </div>
  );
}

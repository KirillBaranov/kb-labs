/**
 * Baseline diff card — shows new failures, fixed packages, and delta per check type.
 * Includes "Update Baseline" button.
 */

import * as React from 'react';
import {
  UICard,
  UIRow,
  UICol,
  UITag,
  UITypographyText,
  UIAlert,
  UIButton,
  UIPopconfirm,
  UIMessage,
  UISpace,
  UIStatistic,
  UIIcon,
  useData,
  useMutateData,
  useTheme,
} from '@kb-labs/sdk/studio';
import { formatCheckLabel } from '../utils/check-display';
import type { QABaselineDiffResponse } from '@kb-labs/qa-contracts';

export function BaselineDiffCard() {
  const { antdToken: token } = useTheme();
  const { data: diffData, isLoading } = useData<QABaselineDiffResponse>('/v1/plugins/qa/baseline/diff');
  const { mutateAsync: updateBaseline, isLoading: isUpdating } = useMutateData<undefined, void>(
    '/v1/plugins/qa/baseline/update',
    'POST',
  );

  const handleUpdateBaseline = async () => {
    void UIMessage.loading('Updating baseline...', 0);
    try {
      await updateBaseline(undefined);
      UIMessage.destroy();
      UIMessage.success('Baseline updated successfully');
    } catch (error) {
      UIMessage.destroy();
      UIMessage.error(`Failed to update baseline: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (isLoading) { return null; }

  if (!diffData?.baseline) {
    return (
      <UIAlert
        variant="warning"
        showIcon
        message="No baseline set"
        description="Run QA first, then update baseline to enable diff tracking."
        action={
          <UIButton
            variant="primary"
            size="small"
            icon={<UIIcon name="SaveOutlined" />}
            onClick={() => void handleUpdateBaseline()}
            loading={isUpdating}
          >
            Create Baseline
          </UIButton>
        }
      />
    );
  }

  if (!diffData.hasDiff) {
    return (
      <UIAlert
        variant="success"
        showIcon
        icon={<UIIcon name="CheckCircleOutlined" />}
        message="No changes since baseline"
        description={`Baseline from ${new Date(diffData.baseline.timestamp).toLocaleString()}`}
        action={
          <UIPopconfirm
            title="Update baseline?"
            description="This will set the current QA state as the new baseline."
            onConfirm={() => void handleUpdateBaseline()}
          >
            <UIButton size="small" icon={<UIIcon name="SaveOutlined" />} loading={isUpdating}>
              Update
            </UIButton>
          </UIPopconfirm>
        }
      />
    );
  }

  let totalNew = 0;
  let totalFixed = 0;
  for (const d of Object.values(diffData.diff)) {
    totalNew += d.newFailures.length;
    totalFixed += d.fixed.length;
  }

  return (
    <UICard
      title={
        <UISpace>
          <UIIcon name="WarningOutlined" style={{ color: totalNew > 0 ? token.colorError : token.colorSuccess }} />
          <span>Baseline Diff</span>
          {totalNew > 0 && <UITag color="error">+{totalNew} new failures</UITag>}
          {totalFixed > 0 && <UITag color="success">{totalFixed} fixed</UITag>}
        </UISpace>
      }
      extra={
        <UIPopconfirm
          title="Update baseline?"
          description="This will set the current QA state as the new baseline."
          onConfirm={() => void handleUpdateBaseline()}
        >
          <UIButton variant="primary" icon={<UIIcon name="SaveOutlined" />} loading={isUpdating} size="small">
            Update Baseline
          </UIButton>
        </UIPopconfirm>
      }
    >
      <UIRow gutter={[16, 16]}>
        {Object.entries(diffData.diff).map(([ct, d]) => (
          <UICol xs={24} sm={12} lg={6} key={ct}>
            <UICard size="small" style={{ textAlign: 'center' }}>
              <UITypographyText strong>{formatCheckLabel(ct)}</UITypographyText>
              <div style={{ marginTop: token.marginXS }}>
                <UIStatistic
                  value={Math.abs(d.delta)}
                  prefix={d.delta > 0 ? <UIIcon name="ArrowUpOutlined" /> : d.delta < 0 ? <UIIcon name="ArrowDownOutlined" /> : null}
                  valueStyle={{
                    color: d.delta > 0 ? token.colorError : d.delta < 0 ? token.colorSuccess : token.colorTextSecondary,
                    fontSize: token.fontSizeHeading3,
                  }}
                  suffix={d.delta > 0 ? 'more failures' : d.delta < 0 ? 'fewer failures' : 'no change'}
                />
              </div>
              {d.newFailures.length > 0 && (
                <div style={{ marginTop: token.marginXS, textAlign: 'left' }}>
                  <UITypographyText type="danger" style={{ fontSize: token.fontSizeSM }}>New failures:</UITypographyText>
                  {d.newFailures.slice(0, 3).map((pkg) => (
                    <div key={pkg}><UITag color="error" style={{ fontSize: token.fontSizeSM }}>{pkg}</UITag></div>
                  ))}
                  {d.newFailures.length > 3 && (
                    <UITypographyText type="secondary" style={{ fontSize: token.fontSizeSM }}>
                      +{d.newFailures.length - 3} more
                    </UITypographyText>
                  )}
                </div>
              )}
              {d.fixed.length > 0 && (
                <div style={{ marginTop: token.marginXS, textAlign: 'left' }}>
                  <UITypographyText type="success" style={{ fontSize: token.fontSizeSM }}>Fixed:</UITypographyText>
                  {d.fixed.slice(0, 3).map((pkg) => (
                    <div key={pkg}><UITag color="success" style={{ fontSize: token.fontSizeSM }}>{pkg}</UITag></div>
                  ))}
                  {d.fixed.length > 3 && (
                    <UITypographyText type="secondary" style={{ fontSize: token.fontSizeSM }}>
                      +{d.fixed.length - 3} more
                    </UITypographyText>
                  )}
                </div>
              )}
            </UICard>
          </UICol>
        ))}
      </UIRow>
    </UICard>
  );
}

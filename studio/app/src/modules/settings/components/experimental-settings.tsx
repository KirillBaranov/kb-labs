/**
 * @module @kb-labs/studio-app/modules/settings/components/experimental-settings
 * Experimental features settings
 */

import * as React from 'react';
import {
  UISwitch,
  UISpace,
  UITypographyText,
  UITypographyParagraph,
  UIAlert,
  UITag,
  UITooltip,
  UIIcon,
} from '@kb-labs/studio-ui-kit';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { FEATURE_FLAGS, type FeatureStatus, type FeatureRisk } from '@/config/feature-flags';

const STATUS_COLORS: Record<FeatureStatus, string> = {
  alpha: 'red',
  beta: 'orange',
  stable: 'green',
  deprecated: 'default',
};

const RISK_COLORS: Record<FeatureRisk, string> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
};

export function ExperimentalSettings() {
  const { isEnabled, toggleFeature } = useFeatureFlags();
  const features = React.useMemo(() => Object.values(FEATURE_FLAGS), []);
  const enabledCount = features.filter((f) => isEnabled(f.id)).length;

  return (
    <UISpace direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <UITypographyParagraph type="secondary" style={{ marginBottom: 0 }}>
          Toggles for in-progress and admin-only features.
        </UITypographyParagraph>
        <UITypographyParagraph type="secondary" style={{ marginTop: 0 }}>
          <strong>{enabledCount}</strong> of <strong>{features.length}</strong> enabled
        </UITypographyParagraph>
      </div>

      <UISpace direction="vertical" size="middle" style={{ width: '100%' }}>
        {features.map((feature) => {
          const enabled = isEnabled(feature.id);

          return (
            <div
              key={feature.id}
              style={{
                padding: '12px 16px',
                backgroundColor: enabled ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
                borderRadius: 8,
                border: `1px solid ${enabled ? 'var(--link)' : 'var(--border-secondary)'}`,
                transition: 'all 200ms ease-in-out',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ paddingTop: 2 }}>
                  <UISwitch checked={enabled} onChange={() => toggleFeature(feature.id)} />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <UITypographyText strong style={{ fontSize: 14 }}>
                      {feature.name}
                    </UITypographyText>
                    <UITag color={STATUS_COLORS[feature.status]}>{feature.status.toUpperCase()}</UITag>
                  </div>

                  <UITypographyParagraph type="secondary" style={{ fontSize: 13, marginBottom: 8, marginTop: 0 }}>
                    {feature.description}
                  </UITypographyParagraph>

                  {feature.details && (
                    <UITooltip title={feature.details} placement="bottomLeft">
                      <UITypographyText
                        type="secondary"
                        style={{ fontSize: 12, cursor: 'help', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                      >
                        Learn more
                      </UITypographyText>
                    </UITooltip>
                  )}
                </div>

                <div style={{ paddingTop: 2 }}>
                  <UITooltip title={`Risk: ${feature.risk}`}>
                    <UITag color={RISK_COLORS[feature.risk]} style={{ margin: 0 }}>
                      {feature.risk.toUpperCase()}
                    </UITag>
                  </UITooltip>
                </div>
              </div>
            </div>
          );
        })}
      </UISpace>

      <UIAlert
        message="These flags gate admin/dev-only UI, not experimental product features"
        description="Turning one off hides the corresponding tab or panel elsewhere in Settings."
        variant="info"
        showIcon
        icon={<UIIcon name="InfoCircleOutlined" />}
      />
    </UISpace>
  );
}

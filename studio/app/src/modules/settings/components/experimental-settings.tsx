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
  UITitle,
  UIAlert,
  UITag,
  UITooltip,
  UIAccordion,
  UIIcon,
} from '@kb-labs/studio-ui-kit';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import {
  FEATURE_FLAGS,
  FEATURE_GROUPS,
  getFeaturesByGroup,
  type FeatureGroup,
  type FeatureStatus,
  type FeatureRisk,
} from '@/config/feature-flags';

const _GROUP_ICONS: Record<FeatureGroup, React.ReactNode> = {
  'ui-ux': <UIIcon name="BgColorsOutlined" />,
  performance: <UIIcon name="ThunderboltOutlined" />,
  ai: <UIIcon name="RobotOutlined" />,
  data: <UIIcon name="DatabaseOutlined" />,
};

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

const RISK_ICONS: Record<FeatureRisk, React.ReactNode> = {
  low: <UIIcon name="InfoCircleOutlined" />,
  medium: <UIIcon name="WarningOutlined" />,
  high: <UIIcon name="WarningOutlined" />,
};

function isNewFeature(addedAt?: string): boolean {
  if (!addedAt) {return false;}
  const added = new Date(addedAt);
  const now = new Date();
  const daysDiff = (now.getTime() - added.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= 7; // Consider "new" if added within last 7 days
}

export function ExperimentalSettings() {
  const { isEnabled, toggleFeature, enabledFeatures, areDependenciesMet } = useFeatureFlags();
  const groupedFeatures = React.useMemo(() => getFeaturesByGroup(), []);

  const enabledCount = enabledFeatures.length;
  const totalCount = Object.keys(FEATURE_FLAGS).length;

  return (
    <UISpace direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Header */}
      <div>
        <UITitle level={4} style={{ marginBottom: 8 }}>
          <UIIcon name="ExperimentOutlined" style={{ marginRight: 8 }} />
          Experimental Features
        </UITitle>
        <UITypographyParagraph type="secondary">
          Enable experimental features to test new functionality before it's generally available.
          These features are still in development and may have bugs or incomplete functionality.
        </UITypographyParagraph>
        <UITypographyParagraph type="secondary" style={{ marginTop: 0 }}>
          <strong>{enabledCount}</strong> of <strong>{totalCount}</strong> features enabled
        </UITypographyParagraph>
      </div>

      {/* Warning Alert */}
      <UIAlert
        message="Experimental Features Notice"
        description="Features marked as Alpha or Beta are actively being developed and may change or be removed without notice. High-risk features may affect application stability."
        variant="warning"
        showIcon
        icon={<UIIcon name="WarningOutlined" />}
      />

      {/* Feature Groups */}
      <UIAccordion
        defaultActiveKey={['ui-ux', 'performance', 'ai', 'data']}
        style={{ backgroundColor: 'transparent' }}
        items={(Object.keys(groupedFeatures) as FeatureGroup[]).map((groupId) => {
          const group = FEATURE_GROUPS[groupId];
          const features = groupedFeatures[groupId];
          const enabledInGroup = features.filter((f) => isEnabled(f.id)).length;

          return {
            key: groupId,
            label: `${group.name} (${enabledInGroup}/${features.length})`,
            style: { marginBottom: 8 },
            children: (
              <UISpace direction="vertical" size="middle" style={{ width: '100%' }}>
                {features.map((feature) => {
                  const enabled = isEnabled(feature.id);
                  const depsNotMet = !areDependenciesMet(feature.id);
                  const isNew = isNewFeature(feature.addedAt);

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
                        {/* Left: Switch */}
                        <div style={{ paddingTop: 2 }}>
                          <UISwitch
                            checked={enabled}
                            onChange={() => toggleFeature(feature.id)}
                            disabled={depsNotMet && !enabled}
                          />
                        </div>

                        {/* Middle: Content */}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <UITypographyText strong style={{ fontSize: 14 }}>
                              {feature.name}
                            </UITypographyText>
                            {isNew && <UITag color="cyan">New</UITag>}
                            <UITag color={STATUS_COLORS[feature.status]}>{feature.status.toUpperCase()}</UITag>
                          </div>

                          <UITypographyParagraph
                            type="secondary"
                            style={{ fontSize: 13, marginBottom: 8, marginTop: 0 }}
                          >
                            {feature.description}
                          </UITypographyParagraph>

                          {/* Details Tooltip */}
                          {feature.details && (
                            <UITooltip title={feature.details} placement="bottomLeft">
                              <UITypographyText
                                type="secondary"
                                style={{
                                  fontSize: 12,
                                  cursor: 'help',
                                  textDecoration: 'underline',
                                  textDecorationStyle: 'dotted',
                                }}
                              >
                                Learn more
                              </UITypographyText>
                            </UITooltip>
                          )}

                          {/* Dependencies warning */}
                          {depsNotMet && !enabled && feature.dependencies && (
                            <div style={{ marginTop: 8 }}>
                              <UIAlert
                                message={`Requires: ${feature.dependencies.map((d) => FEATURE_FLAGS[d].name).join(', ')}`}
                                variant="info"
                                showIcon
                                icon={<UIIcon name="InfoCircleOutlined" />}
                                style={{ fontSize: 12, padding: '4px 8px' }}
                              />
                            </div>
                          )}

                          {/* Deprecated warning */}
                          {feature.status === 'deprecated' && (
                            <div style={{ marginTop: 8 }}>
                              <UIAlert
                                message="This feature is deprecated and will be removed soon"
                                variant="warning"
                                showIcon
                                style={{ fontSize: 12, padding: '4px 8px' }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Right: Risk Badge */}
                        <div style={{ paddingTop: 2 }}>
                          <UITooltip title={`Risk: ${feature.risk}`}>
                            <UITag
                              color={RISK_COLORS[feature.risk]}
                              icon={RISK_ICONS[feature.risk]}
                              style={{ margin: 0 }}
                            >
                              {feature.risk.toUpperCase()}
                            </UITag>
                          </UITooltip>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </UISpace>
            ),
          };
        })}
      />

      {/* Footer Info */}
      <UIAlert
        message="Feature Stability Levels"
        description={
          <div>
            <div style={{ marginBottom: 4 }}>
              <UITag color="red">ALPHA</UITag> - Early development, expect breaking changes
            </div>
            <div style={{ marginBottom: 4 }}>
              <UITag color="orange">BETA</UITag> - Feature-complete but needs testing
            </div>
            <div style={{ marginBottom: 4 }}>
              <UITag color="green">STABLE</UITag> - Production-ready, safe to use
            </div>
            <div>
              <UITag color="default">DEPRECATED</UITag> - Will be removed soon
            </div>
          </div>
        }
        variant="info"
        showIcon
      />
    </UISpace>
  );
}

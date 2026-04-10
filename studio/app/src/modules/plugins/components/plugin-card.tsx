import {
  UICard,
  UITag,
  UISpace,
  UITypographyText,
  UITypographyParagraph,
  UITooltip,
  UIIcon,
} from '@kb-labs/studio-ui-kit';
import type { PluginManifestEntry } from '@kb-labs/studio-data-client';

interface PluginCardProps {
  plugin: PluginManifestEntry;
  onClick: () => void;
}

export function PluginCard({ plugin, onClick }: PluginCardProps) {
  const { manifest } = plugin;
  const display = manifest.display;

  const cliCount = manifest.cli?.commands.length ?? 0;
  const restCount = manifest.rest?.routes.length ?? 0;
  const workflowCount = manifest.workflows?.handlers.length ?? 0;
  const jobCount = manifest.jobs?.handlers.length ?? 0;

  const hasPermissions = !!manifest.permissions;
  const requiresPlatform = manifest.platform?.requires && manifest.platform.requires.length > 0;
  const hasValidationErrors = plugin.validation && !plugin.validation.valid;

  return (
    <UICard
      hoverable
      onClick={onClick}
      style={{ height: '100%', cursor: 'pointer' }}
      styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}
    >
      <UISpace direction="vertical" size="small" style={{ width: '100%', flex: 1 }}>
        {/* Header: Icon + Name */}
        <UISpace align="center" style={{ width: '100%' }}>
          <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, opacity: display?.icon ? 1 : 0.4 }}>
            {display?.icon || <UIIcon name="AppstoreOutlined" />}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <UITypographyText strong style={{ fontSize: 14 }}>
              {display?.name || manifest.id}
            </UITypographyText>
            <br />
            <UITypographyText type="secondary" style={{ fontSize: 12 }}>
              v{manifest.version}
            </UITypographyText>
          </div>
        </UISpace>

        {/* Description */}
        {display?.description && (
          <UITypographyParagraph
            type="secondary"
            style={{
              fontSize: 13,
              marginBottom: 8,
              lineHeight: 1.4,
            }}
            ellipsis={{ rows: 2, tooltip: display.description }}
          >
            {display.description}
          </UITypographyParagraph>
        )}

        {/* Tags */}
        {display?.tags && display.tags.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {display.tags.slice(0, 3).map((tag) => (
              <UITag key={tag} style={{ fontSize: 11, marginBottom: 4 }}>
                {tag}
              </UITag>
            ))}
            {display.tags.length > 3 && (
              <UITag style={{ fontSize: 11 }}>+{display.tags.length - 3}</UITag>
            )}
          </div>
        )}

        {/* Capabilities */}
        <UISpace wrap size={4}>
          {cliCount > 0 && (
            <UITooltip title={`${cliCount} CLI command${cliCount > 1 ? 's' : ''}`}>
              <UITag icon={<UIIcon name="CodeOutlined" />} color="blue">
                {cliCount}
              </UITag>
            </UITooltip>
          )}
          {restCount > 0 && (
            <UITooltip title={`${restCount} REST route${restCount > 1 ? 's' : ''}`}>
              <UITag icon={<UIIcon name="ApiOutlined" />} color="green">
                {restCount}
              </UITag>
            </UITooltip>
          )}
          {workflowCount > 0 && (
            <UITooltip title={`${workflowCount} workflow${workflowCount > 1 ? 's' : ''}`}>
              <UITag icon={<UIIcon name="NodeIndexOutlined" />} color="purple">
                {workflowCount}
              </UITag>
            </UITooltip>
          )}
          {jobCount > 0 && (
            <UITooltip title={`${jobCount} scheduled job${jobCount > 1 ? 's' : ''}`}>
              <UITag icon={<UIIcon name="ClockCircleOutlined" />} color="orange">
                {jobCount}
              </UITag>
            </UITooltip>
          )}
        </UISpace>

        {/* Indicators */}
        <UISpace wrap size={4} style={{ marginTop: 'auto' }}>
          {hasValidationErrors && (
            <UITooltip title={`${plugin.validation!.errors.length} validation error${plugin.validation!.errors.length > 1 ? 's' : ''}`}>
              <UITag icon={<UIIcon name="CloseCircleOutlined" />} color="red" style={{ fontSize: 11 }}>Invalid</UITag>
            </UITooltip>
          )}
          {hasPermissions && (
            <UITooltip title="Requires permissions">
              <UITag icon={<UIIcon name="WarningOutlined" />} color="gold" style={{ fontSize: 11 }}>Permissions</UITag>
            </UITooltip>
          )}
          {requiresPlatform && (
            <UITooltip title={`Requires: ${manifest.platform!.requires!.join(', ')}`}>
              <UITag icon={<UIIcon name="CheckCircleOutlined" />} color="cyan" style={{ fontSize: 11 }}>Platform</UITag>
            </UITooltip>
          )}
        </UISpace>
      </UISpace>
    </UICard>
  );
}

import { UISpace, UITag, UIIcon } from '@kb-labs/studio-ui-kit';
import type { PluginManifestEntry } from '@kb-labs/studio-data-client';
import './plugin-status-strip.css';

export interface PluginStatusStripProps {
  plugin: PluginManifestEntry;
}

export function PluginStatusStrip({ plugin }: PluginStatusStripProps) {
  const { manifest } = plugin;
  const display = manifest.display;
  const isValid = !plugin.validation || plugin.validation.valid;

  const cliCommands = manifest.cli?.commands || [];
  const restRoutes = manifest.rest?.routes || [];
  const workflowHandlers = manifest.workflows?.handlers || [];
  const jobs = manifest.jobs?.handlers || [];
  const permissions = manifest.permissions;
  const platformReqs = manifest.platform;

  const metrics: { value: string; label: string }[] = [
    { value: `v${manifest.version}`, label: typeof plugin.source === 'string' ? plugin.source : plugin.source?.kind || 'unknown' },
    ...(cliCommands.length > 0 ? [{ value: String(cliCommands.length), label: cliCommands.length === 1 ? 'CLI command' : 'CLI commands' }] : []),
    ...(restRoutes.length > 0 ? [{ value: String(restRoutes.length), label: restRoutes.length === 1 ? 'REST route' : 'REST routes' }] : []),
    ...(workflowHandlers.length > 0 ? [{ value: String(workflowHandlers.length), label: workflowHandlers.length === 1 ? 'workflow' : 'workflows' }] : []),
    ...(jobs.length > 0 ? [{ value: String(jobs.length), label: jobs.length === 1 ? 'scheduled job' : 'scheduled jobs' }] : []),
  ];

  return (
    <div className="plugin-status-strip">
      <div className="plugin-status-strip__pulse">
        <div className="plugin-status-strip__status">
          <span className={`plugin-status-strip__dot${isValid ? '' : ' plugin-status-strip__dot--error'}`} />
          <span className="plugin-status-strip__status-label">
            {isValid ? 'Valid manifest' : 'Validation failed'}
          </span>
        </div>

        <span className="plugin-status-strip__divider" />

        {metrics.map((metric, idx) => (
          <div className="plugin-status-strip__metric" key={`${metric.label}-${idx}`}>
            <span className="plugin-status-strip__value">{metric.value}</span>
            <span className="plugin-status-strip__label">{metric.label}</span>
          </div>
        ))}

        {permissions && (
          <div className="plugin-status-strip__metric plugin-status-strip__metric--warning">
            <UIIcon name="LockOutlined" />
            <span className="plugin-status-strip__value">Requires permissions</span>
          </div>
        )}
      </div>

      {platformReqs?.requires && platformReqs.requires.length > 0 && (
        <UISpace wrap size="small">
          <span className="plugin-status-strip__label">Platform requirements:</span>
          {platformReqs.requires.map((req) => (
            <UITag key={req}>{req}</UITag>
          ))}
        </UISpace>
      )}

      {display?.tags && display.tags.length > 0 && (
        <UISpace wrap size="small">
          {display.tags.map((tag, idx) => (
            <UITag key={typeof tag === 'string' ? tag : `tag-${idx}`}>
              {typeof tag === 'string' ? tag : JSON.stringify(tag)}
            </UITag>
          ))}
        </UISpace>
      )}

      {(display?.homepage || display?.repository) && (
        <div className="plugin-status-strip__links">
          {display?.homepage && (
            <a href={display.homepage} target="_blank" rel="noopener noreferrer">
              <UIIcon name="GlobalOutlined" />
              Homepage
            </a>
          )}
          {display?.repository && (
            <a href={display.repository} target="_blank" rel="noopener noreferrer">
              <UIIcon name="LinkOutlined" />
              Repository
            </a>
          )}
        </div>
      )}
    </div>
  );
}

import { UISpace, UIAlert, UICard, UITag, UIIcon } from '@kb-labs/studio-ui-kit';

interface CapabilitiesSummaryProps {
  cliCommands: any[];
  restRoutes: any[];
  workflowHandlers: any[];
  jobs: any[];
  permissions?: any;
  platformReqs?: {
    requires?: string[];
  };
}

export function CapabilitiesSummary({
  cliCommands,
  restRoutes,
  workflowHandlers,
  jobs,
  permissions,
  platformReqs,
}: CapabilitiesSummaryProps) {
  return (
    <UICard title="Capabilities">
      <UISpace direction="vertical" size="middle" style={{ width: '100%' }}>
        <UISpace wrap size="large">
          {cliCommands.length > 0 && (
            <div>
              <UITag
                icon={<UIIcon name="CodeOutlined" />}
                color="blue"
                style={{ fontSize: 14, padding: '4px 12px' }}
              >
                {cliCommands.length} CLI Command{cliCommands.length > 1 ? 's' : ''}
              </UITag>
            </div>
          )}
          {restRoutes.length > 0 && (
            <div>
              <UITag
                icon={<UIIcon name="ApiOutlined" />}
                color="green"
                style={{ fontSize: 14, padding: '4px 12px' }}
              >
                {restRoutes.length} REST Route{restRoutes.length > 1 ? 's' : ''}
              </UITag>
            </div>
          )}
          {workflowHandlers.length > 0 && (
            <div>
              <UITag
                icon={<UIIcon name="NodeIndexOutlined" />}
                color="purple"
                style={{ fontSize: 14, padding: '4px 12px' }}
              >
                {workflowHandlers.length} Workflow{workflowHandlers.length > 1 ? 's' : ''}
              </UITag>
            </div>
          )}
          {jobs.length > 0 && (
            <div>
              <UITag
                icon={<UIIcon name="ClockCircleOutlined" />}
                color="orange"
                style={{ fontSize: 14, padding: '4px 12px' }}
              >
                {jobs.length} Scheduled Job{jobs.length > 1 ? 's' : ''}
              </UITag>
            </div>
          )}
        </UISpace>

        {permissions && (
          <UIAlert
            icon={<UIIcon name="LockOutlined" />}
            variant="warning"
            message="This plugin requires permissions"
            description="See Permissions tab for details"
            showIcon
          />
        )}
        {platformReqs?.requires && platformReqs.requires.length > 0 && (
          <UIAlert
            icon={<UIIcon name="DatabaseOutlined" />}
            variant="info"
            message="Platform Requirements"
            description={
              <UISpace wrap>
                {platformReqs.requires.map((req) => (
                  <UITag key={req} color="cyan">
                    {req}
                  </UITag>
                ))}
              </UISpace>
            }
            showIcon
          />
        )}
      </UISpace>
    </UICard>
  );
}

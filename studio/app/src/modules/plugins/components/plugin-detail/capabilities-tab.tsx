import { UITabs, type UITabItem, UIIcon } from '@kb-labs/studio-ui-kit';
import { CLICommandsTable } from './cli-commands-table';
import { RestRoutesTable } from './rest-routes-table';
import { WorkflowsTable } from './workflows-table';
import { JobsTable } from './jobs-table';

export interface CapabilitiesTabProps {
  cliCommands: any[];
  restRoutes: any[];
  workflowHandlers: any[];
  jobs: any[];
  restBasePath?: string;
  apiBasePath?: string;
}

export function CapabilitiesTab({
  cliCommands,
  restRoutes,
  workflowHandlers,
  jobs,
  restBasePath,
  apiBasePath,
}: CapabilitiesTabProps) {
  const subTabs: UITabItem[] = [
    ...(cliCommands.length > 0 ? [{
      key: 'cli',
      label: `CLI Commands (${cliCommands.length})`,
      icon: <UIIcon name="CodeOutlined" />,
      children: <CLICommandsTable commands={cliCommands} />,
    }] : []),
    ...(restRoutes.length > 0 ? [{
      key: 'rest',
      label: `REST API (${restRoutes.length})`,
      icon: <UIIcon name="ApiOutlined" />,
      children: <RestRoutesTable routes={restRoutes} basePath={restBasePath} apiBasePath={apiBasePath} />,
    }] : []),
    ...(workflowHandlers.length > 0 ? [{
      key: 'workflows',
      label: `Workflows (${workflowHandlers.length})`,
      icon: <UIIcon name="NodeIndexOutlined" />,
      children: <WorkflowsTable handlers={workflowHandlers} />,
    }] : []),
    ...(jobs.length > 0 ? [{
      key: 'jobs',
      label: `Jobs (${jobs.length})`,
      icon: <UIIcon name="ClockCircleOutlined" />,
      children: <JobsTable jobs={jobs} />,
    }] : []),
  ];

  if (subTabs.length <= 1) {
    return subTabs[0]?.children ?? null;
  }

  return <UITabs items={subTabs} />;
}

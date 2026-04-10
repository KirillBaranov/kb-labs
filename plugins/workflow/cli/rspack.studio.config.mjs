import { createStudioRemoteConfig } from '@kb-labs/studio-plugin-tools';

export default await createStudioRemoteConfig({
  name: 'workflowPlugin',
  exposes: {
    './Dashboard':        './src/studio/pages/WorkflowsDashboard.tsx',
    './Runs':             './src/studio/pages/WorkflowsRuns.tsx',
    './RunDetail':        './src/studio/pages/WorkflowRunDetail.tsx',
    './Definitions':      './src/studio/pages/WorkflowsDefinitions.tsx',
    './DefinitionDetail': './src/studio/pages/WorkflowDefinitionDetail.tsx',
    './Jobs':             './src/studio/pages/WorkflowsJobs.tsx',
    './Crons':            './src/studio/pages/WorkflowsCrons.tsx',
  },
});

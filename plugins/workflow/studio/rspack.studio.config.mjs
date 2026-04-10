/**
 * Rspack config for workflow plugin Studio pages (Module Federation remote).
 * Builds to dist/widgets/ alongside the main CLI build.
 *
 * Build: pnpm run build
 * Dev:   pnpm run dev
 */

import { createStudioRemoteConfig } from '@kb-labs/studio-plugin-tools';

export default await createStudioRemoteConfig({
  name: 'workflowPlugin',
  exposes: {
    './Dashboard':        './src/pages/WorkflowsDashboard.tsx',
    './Runs':             './src/pages/WorkflowsRuns.tsx',
    './RunDetail':        './src/pages/WorkflowRunDetail.tsx',
    './Definitions':      './src/pages/WorkflowsDefinitions.tsx',
    './DefinitionDetail': './src/pages/WorkflowDefinitionDetail.tsx',
    './Jobs':             './src/pages/WorkflowsJobs.tsx',
    './Crons':            './src/pages/WorkflowsCrons.tsx',
  },
  // Output to workflow-cli's dist/widgets so REST API can serve them
  // (REST API resolves widgetBundleDir from the manifest-owning package root)
  outputDir: '../workflow-cli/dist/widgets',
});

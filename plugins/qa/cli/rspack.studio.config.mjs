import { createStudioRemoteConfig } from '@kb-labs/studio-plugin-tools';

export default await createStudioRemoteConfig({
  name: 'qaPlugin',
  exposes: {
    './QADashboard': './src/studio/pages/QADashboard.tsx',
  },
});

import { createStudioRemoteConfig } from '@kb-labs/studio-plugin-tools';

export default await createStudioRemoteConfig({
  name: 'agentPlugin',
  exposes: {
    './AgentsPage': './src/studio/pages/AgentsPage.tsx',
  },
});

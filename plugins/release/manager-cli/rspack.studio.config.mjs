import { createStudioRemoteConfig } from '@kb-labs/studio-plugin-tools';

export default await createStudioRemoteConfig({
  name: 'releasePlugin',
  exposes: {
    './ReleasePage': './src/studio/pages/ReleasePage.tsx',
  },
});

import preset from '@kb-labs/devkit/vitest/node';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  preset,
  defineConfig({
    test: {
      // E2E tests spawn subprocesses and bind to fixed ports — never run files in parallel.
      fileParallelism: false,
      // Harness self-tests boot real services, so give them room.
      testTimeout: 120_000,
      hookTimeout: 120_000,
    },
  }),
);

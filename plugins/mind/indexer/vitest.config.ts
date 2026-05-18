import base from "@kb-labs/devkit/vitest/node";
import { mergeConfig, defineConfig } from "vitest/config";

// Indexer e2e specs run real indexing on fixture repos; the default 5s
// timeout flakes on slower CI runners. orchestrator.spec.ts in particular
// runs updateIndexes 3x with timeBudgetMs: 5000 each, so the suite needs
// generous wall-clock headroom on CI. Bumped from 20s -> 60s after the
// "removes deleted files from indexes" test timed out at 20000ms on a
// shared runner under coverage instrumentation.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      testTimeout: 60_000,
    },
  }),
);

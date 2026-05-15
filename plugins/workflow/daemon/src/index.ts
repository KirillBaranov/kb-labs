#!/usr/bin/env node

/**
 * @module @kb-labs/workflow-daemon
 * Entry point for KB Workflow Daemon
 */

import { bootstrap } from './bootstrap.js';

(async () => {
  try {
    await bootstrap(process.cwd());
  } catch (error) {
    process.stderr.write(`[workflow-daemon] FATAL: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
})();

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
    console.error('Failed to start workflow daemon:', error);
    process.exit(1);
  }
})();

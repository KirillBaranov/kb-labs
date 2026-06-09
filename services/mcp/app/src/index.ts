import { bootstrap } from './bootstrap.js';

// runDaemon() (called inside bootstrap) resolves repo root via findRepoRoot().
bootstrap().catch((error) => {
  console.error('Failed to start MCP daemon:', error);
  process.exit(1);
});

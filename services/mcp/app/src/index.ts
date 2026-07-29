import { bootstrap } from './bootstrap.js';

// runService() (called inside bootstrap) resolves env and platform/project roots.
bootstrap().catch((error) => {
  console.error('Failed to start MCP daemon:', error);
  process.exit(1);
});

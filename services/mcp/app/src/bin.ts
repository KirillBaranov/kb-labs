/**
 * MCP daemon process entry point.
 */

import { bootstrap } from './bootstrap.js';

bootstrap(process.cwd()).catch((error) => {
  console.error('Failed to start MCP daemon:', error);
  process.exit(1);
});

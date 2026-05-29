import { bootstrap } from './bootstrap.js';

// process.cwd() = workspace root when launched via `node .../services/mcp/app/dist/index.js`.
bootstrap(process.cwd()).catch((error) => {
  console.error('Failed to start MCP daemon:', error);
  process.exit(1);
});

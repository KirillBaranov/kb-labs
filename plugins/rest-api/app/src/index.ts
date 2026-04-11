/**
 * @module @kb-labs/rest-api-app
 * REST API application entry point
 */

import { bootstrap } from './bootstrap';

// process.cwd() = workspace root when launched via `node ./platform/kb-labs-rest-api/.../dist/index.js`
bootstrap(process.cwd()).catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});


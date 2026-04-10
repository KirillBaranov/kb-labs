/**
 * @module @kb-labs/marketplace-app
 * Marketplace service entry point.
 */

import { bootstrap } from './bootstrap.js';

bootstrap(process.cwd()).catch((error) => {
  console.error('Failed to start marketplace service:', error);
  process.exit(1);
});

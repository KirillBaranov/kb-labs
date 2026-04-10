/**
 * State daemon CLI
 */

import { bootstrap } from './bootstrap.js';

bootstrap(process.cwd()).catch((error) => {
  console.error('Failed to start state daemon:', error);
  process.exit(1);
});

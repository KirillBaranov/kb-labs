import { startDaemon } from './daemon.js';

startDaemon().catch((err) => {
  console.error('[host-agent] Fatal error:', err);
  process.exit(1);
});

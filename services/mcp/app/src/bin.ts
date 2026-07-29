/**
 * MCP daemon process entry point.
 */

import { bootstrap } from "./bootstrap.js";

bootstrap().catch(() => {
  // runService() already emitted the canonical platform/service failure event.
  // Setting exitCode lets its logger flush without duplicating an unstructured stack.
  process.exitCode = 1;
});

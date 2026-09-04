#!/usr/bin/env node
import { bootstrap } from "./bootstrap.js";

// runService() (called inside bootstrap) resolves env and platform/project roots.
bootstrap().catch(() => {
  // runService() already emitted the canonical platform/service failure event.
  // Setting exitCode lets its logger flush without duplicating an unstructured stack.
  process.exitCode = 1;
});

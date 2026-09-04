#!/usr/bin/env node
import { bootstrap } from "./bootstrap.js";

// process.cwd() = workspace root when launched via `node ./infra/kb-labs-gateway/.../dist/index.js`
bootstrap(process.cwd()).catch(() => {
  // runService() already emitted the canonical platform/service failure event.
  // Setting exitCode lets its logger flush without duplicating an unstructured stack.
  process.exitCode = 1;
});

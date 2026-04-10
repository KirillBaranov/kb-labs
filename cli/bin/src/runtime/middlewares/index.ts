import type { MiddlewareConfig } from "@kb-labs/cli-runtime";
import { createTimingMiddleware } from "./timing";

export function getDefaultMiddlewares(): MiddlewareConfig[] {
  return [createTimingMiddleware()];
}

export { createTimingMiddleware };


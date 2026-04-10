import { formatTiming, TimingTracker } from "@kb-labs/shared-cli-ui";
import type { MiddlewareConfig } from "@kb-labs/cli-runtime";

export function createTimingMiddleware(): MiddlewareConfig {
  return {
    name: "timing",
    priority: 100,
    middleware: async (ctx, next) => {
      const tracker = new TimingTracker();
      const result = await next();
      const total = tracker.total();

      if (ctx && Array.isArray(ctx.diagnostics)) {
        ctx.diagnostics.push(`runtime: ${formatTiming(total)}`);
      }

      ctx?.logger?.debug?.(
        `[runtime] command executed in ${total}ms`,
      );

      return result;
    },
  };
}


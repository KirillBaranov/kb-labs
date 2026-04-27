/**
 * @module @kb-labs/cli-runtime/middleware/middleware-manager
 * Middleware chain management
 */

import type { ExecutionLimits } from "../lifecycle/lifecycle-manager.js";

export type CommandMiddleware<T = unknown> = (
  ctx: unknown,
  next: () => Promise<T>,
) => Promise<T>;

export interface MiddlewareConfig {
  name: string;
  priority: number; // lower = runs earlier
  timeoutMs?: number;
  middleware: CommandMiddleware;
}

export class MiddlewareManager {
  private middlewares: MiddlewareConfig[] = [];

  constructor(private limits: ExecutionLimits) {}

  register(config: MiddlewareConfig): void {
    this.middlewares.push(config);
    this.middlewares.sort((a, b) => a.priority - b.priority);
  }

  buildChain<T = unknown>(): CommandMiddleware<T>[] {
    return this.middlewares.map(
      (m) => m.middleware as CommandMiddleware<T>,
    );
  }

  async execute<T>(ctx: unknown, handler: () => Promise<T>): Promise<T> {
    const chain = this.buildChain<T>();

    const dispatch = async (index: number): Promise<T> => {
      if (index >= chain.length) {
        return handler();
      }

      const middleware = chain[index];
      if (!middleware) {
        return handler();
      }

      return middleware(ctx, () => dispatch(index + 1));
    };

    return dispatch(0);
  }
}


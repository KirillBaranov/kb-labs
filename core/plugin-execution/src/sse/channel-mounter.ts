import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ILogger } from "@kb-labs/core-platform";
import {
  DEFAULT_PERMISSIONS,
  type EventStreamInput,
  type ManifestV3,
  type PluginContextDescriptor,
  type RestHostContext,
} from "@kb-labs/plugin-contracts";
import { createSseStream } from "@kb-labs/shared-http";
import type { ExecutionBackend } from "../types.js";
import { createExecutionId, normalizeHeaders } from "../utils.js";

export interface MountEventStreamsOptions {
  backend: ExecutionBackend;
  logger: ILogger;
  serviceId: string;
  pluginRoot: string;
  workspaceRoot: string;
  basePath?: string;
  defaultTimeoutMs?: number;
  defaultKeepAliveMs?: number;
}

/** Mount manifest-declared plugin SSE streams with a host-owned connection. */
export async function mountEventStreams(
  server: FastifyInstance,
  manifest: ManifestV3,
  options: MountEventStreamsOptions,
): Promise<{ mounted: number; errors: string[] }> {
  const streams = manifest.sse?.streams ?? [];
  const errors: string[] = [];
  let mounted = 0;
  for (const declaration of streams) {
    const path = `${options.basePath ?? ""}${declaration.path}`;
    try {
      server.get(path, async (request: FastifyRequest, reply: FastifyReply) => {
        const requestId =
          typeof request.headers["x-request-id"] === "string"
            ? request.headers["x-request-id"]
            : createExecutionId();
        const traceId =
          typeof request.headers["x-trace-id"] === "string"
            ? request.headers["x-trace-id"]
            : createExecutionId();
        const stream = createSseStream(request, reply, {
          logger: options.logger.child({ pluginId: manifest.id }),
          serviceId: options.serviceId,
          requestId,
          traceId,
          route: path,
          keepAliveMs:
            declaration.keepAliveMs ?? options.defaultKeepAliveMs ?? 30_000,
        });
        const hostContext: RestHostContext = {
          host: "rest",
          method: request.method,
          path: request.url,
          headers: normalizeHeaders(request.headers),
          query: request.query as Record<string, string> | undefined,
          body: undefined,
          requestId,
          traceId,
          tenantId:
            typeof request.headers["x-tenant-id"] === "string"
              ? request.headers["x-tenant-id"]
              : undefined,
        };
        const descriptor: PluginContextDescriptor = {
          hostType: "rest",
          pluginId: manifest.id,
          pluginVersion: manifest.version,
          requestId,
          permissions:
            declaration.permissions ??
            manifest.permissions ??
            DEFAULT_PERMISSIONS,
          hostContext,
        };
        const execute = async (input: EventStreamInput) => {
          const executionId = createExecutionId();
          const result = await options.backend.execute({
            executionId,
            descriptor: { ...descriptor, executionId },
            pluginRoot: options.pluginRoot,
            handlerRef: declaration.handler,
            input,
            workspace: { type: "local", cwd: options.workspaceRoot },
            timeoutMs: declaration.timeoutMs ?? options.defaultTimeoutMs,
          });
          if (!result.ok) {
            throw new Error(
              result.error?.message ?? "Event stream handler failed",
            );
          }
        };
        stream.onError((error) => {
          void execute({ event: "error", error, sender: stream }).catch(
            (handlerError) => {
              options.logger.error(
                "Plugin SSE error handler failed",
                handlerError instanceof Error
                  ? handlerError
                  : new Error(String(handlerError)),
                {
                  pluginId: manifest.id,
                  path,
                  event: "sse.plugin.error_handler_failed",
                },
              );
            },
          );
        });
        try {
          await execute({ event: "connect", sender: stream });
        } catch (error) {
          options.logger.error(
            "Plugin SSE connect failed",
            error instanceof Error ? error : new Error(String(error)),
            {
              pluginId: manifest.id,
              path,
              event: "sse.plugin.connect_failed",
            },
          );
          void execute({
            event: "error",
            error: error instanceof Error ? error : new Error(String(error)),
            sender: stream,
          }).catch((handlerError) => {
            options.logger.error(
              "Plugin SSE error handler failed",
              handlerError instanceof Error
                ? handlerError
                : new Error(String(handlerError)),
              {
                pluginId: manifest.id,
                path,
                event: "sse.plugin.error_handler_failed",
              },
            );
          });
          stream.close("handler_error");
          return;
        }
        stream.onCleanup(() => {
          void execute({ event: "disconnect" }).catch((error) => {
            options.logger.error(
              "Plugin SSE disconnect handler failed",
              error instanceof Error ? error : new Error(String(error)),
              {
                pluginId: manifest.id,
                path,
                event: "sse.plugin.disconnect_failed",
              },
            );
          });
        });
        await stream.closed;
      });
      mounted += 1;
    } catch (error) {
      errors.push(
        `${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { mounted, errors };
}

import type {
  CommandResult,
  EventStreamInput,
  EventStreamSender,
  PluginContextV3,
} from "@kb-labs/plugin-contracts";

export interface EventStreamHandler<TConfig = unknown> {
  onConnect?(
    context: PluginContextV3<TConfig>,
    stream: EventStreamSender,
  ): Promise<void> | void;
  onDisconnect?(context: PluginContextV3<TConfig>): Promise<void> | void;
  onError?(
    context: PluginContextV3<TConfig>,
    error: Error,
    stream: EventStreamSender,
  ): Promise<void> | void;
}

export interface EventStreamDefinition<TConfig = unknown> {
  path: string;
  description?: string;
  handler: EventStreamHandler<TConfig>;
}

/**
 * Defines a declarative plugin SSE endpoint. The REST host owns the HTTP
 * connection and invokes this lifecycle in-process, just like defineWebSocket.
 */
export function defineEventStream<TConfig = unknown>(
  definition: EventStreamDefinition<TConfig>,
) {
  return {
    async execute(
      context: PluginContextV3<TConfig>,
      input: EventStreamInput,
    ): Promise<CommandResult> {
      if (context.host !== "rest") {
        throw new Error(
          `Event stream ${definition.path} can only run in rest host (current: ${context.host})`,
        );
      }
      if (
        (input.event === "connect" || input.event === "error") &&
        !input.sender
      ) {
        throw new Error("Event stream sender not provided in input");
      }
      switch (input.event) {
        case "connect":
          await definition.handler.onConnect?.(context, input.sender!);
          break;
        case "disconnect":
          await definition.handler.onDisconnect?.(context);
          break;
        case "error":
          await definition.handler.onError?.(
            context,
            input.error ?? new Error("Event stream error"),
            input.sender!,
          );
          break;
      }
      return { ok: true };
    },
  };
}

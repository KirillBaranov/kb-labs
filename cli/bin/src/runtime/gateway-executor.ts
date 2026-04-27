/**
 * Gateway Executor — thin client execution path.
 *
 * When Gateway is available (Host Agent IPC or HTTP credentials),
 * plugin commands execute remotely instead of locally.
 *
 * CLI → resolveTransport() → IGatewayClient.execute() → stream events → render
 *
 * Ctrl+C → client.cancel(executionId) → Gateway aborts execution (CC2).
 */

import type { IGatewayClient, GatewayExecuteRequest } from '@kb-labs/cli-runtime/gateway';
import { resolveTransport, TerminalEventRenderer } from '@kb-labs/cli-runtime/gateway';
import type { RegisteredCommand } from '@kb-labs/cli-commands';

export interface GatewayExecutionOptions {
  commandId: string;
  argv: string[];
  flags: Record<string, unknown>;
  manifestCmd: RegisteredCommand | undefined;
}

/**
 * Try to resolve a Gateway transport.
 * Returns null if no Gateway is available (fall back to local execution).
 */
export async function tryResolveGateway(): Promise<IGatewayClient | null> {
  try {
    return await resolveTransport();
  } catch {
    // No Gateway available — fall back to local execution
    return null;
  }
}

/**
 * Execute a plugin command via Gateway (thin client mode).
 *
 * Returns exit code from the execution:done event.
 * Handles Ctrl+C by sending cancel request to Gateway.
 */
export async function executeViaGateway(
  client: IGatewayClient,
  options: GatewayExecutionOptions,
): Promise<number> {
  const { commandId, argv, flags, manifestCmd } = options;

  if (!manifestCmd) {
    throw new Error(`No manifest found for command: ${commandId}`);
  }

  // Build Gateway execute request from manifest command
  const v3Manifest = manifestCmd.v3Manifest ?? manifestCmd.manifest.manifestV2;
  const pluginId = v3Manifest?.id || manifestCmd.manifest.id;
  const cliCommand = v3Manifest?.cli?.commands?.find((c) => c.id === commandId);
  const handlerRef = cliCommand?.handlerPath ?? '';

  const request: GatewayExecuteRequest = {
    pluginId,
    handlerRef,
    exportName: cliCommand?.handler?.split('#')[1] ?? 'default',
    input: { argv, flags },
  };

  const renderer = new TerminalEventRenderer();
  let exitCode = 1;
  let executionId: string | undefined;
  let cancelled = false;

  // Ctrl+C handler — cancel remote execution via Gateway
  const onSigint = () => {
    if (executionId && !cancelled) {
      cancelled = true;
      void client.cancel(executionId, 'user');
    }
  };
  process.on('SIGINT', onSigint);

  try {
    for await (const event of client.execute(request)) {
      // Track executionId from first event
      if (!executionId && 'executionId' in event) {
        executionId = event.executionId;
      }

      renderer.render(event);

      if (event.type === 'execution:done') {
        exitCode = event.exitCode ?? 0;
      }
    }
  } finally {
    process.removeListener('SIGINT', onSigint);
    renderer.finish();
    await client.close();
  }

  return exitCode;
}

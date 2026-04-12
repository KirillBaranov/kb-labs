/**
 * workspace:status command (alias: agent:status)
 * Show Workspace Agent daemon status via IPC socket.
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { HostAgentClient } from '@kb-labs/host-agent-client';
import { createTransport } from '@kb-labs/host-agent-transport';

type StatusInput = {
  json?: boolean;
};

type StatusResult = {
  exitCode: number;
  running: boolean;
  connected?: boolean;
  hostId?: string;
  gatewayUrl?: string;
};

export default defineCommand({
  id: 'workspace:status',
  description: 'Show Workspace Agent daemon status',

  handler: {
    async execute(ctx: PluginContextV3, rawInput: StatusInput): Promise<StatusResult> {
      const input: StatusInput = (rawInput as any).flags ?? rawInput;

      let ipcStatus: { connected: boolean; hostId?: string; gatewayUrl?: string; reconnecting?: boolean } | null = null;

      try {
        const transport = createTransport({ mode: 'auto' });
        const client = new HostAgentClient({ transport, requestTimeout: 3000 });
        await client.connect();
        ipcStatus = await client.status();
        client.close();
      } catch {
        // IPC unreachable — daemon not running
      }

      if (ipcStatus === null) {
        if (input.json) {
          ctx.ui?.json?.({ running: false });
        } else {
          ctx.ui?.info?.('Workspace Agent is not running. Start with: pnpm dev:start host-agent');
        }
        return { exitCode: 0, running: false };
      }

      const statusLabel = ipcStatus.connected
        ? 'connected'
        : ipcStatus.reconnecting
          ? 'reconnecting...'
          : 'disconnected';

      const result: StatusResult = {
        exitCode: 0,
        running: true,
        connected: ipcStatus.connected,
        hostId: ipcStatus.hostId,
        gatewayUrl: ipcStatus.gatewayUrl,
      };

      if (input.json) {
        ctx.ui?.json?.(result);
      } else {
        ctx.ui?.success?.('Workspace Agent Status', {
          sections: [{
            items: [
              `Status:     ${statusLabel}`,
              ...(ipcStatus.hostId ? [`Host ID:    ${ipcStatus.hostId}`] : []),
              ...(ipcStatus.gatewayUrl ? [`Gateway:    ${ipcStatus.gatewayUrl}`] : []),
            ],
          }],
        });
      }

      return result;
    },
  },
});

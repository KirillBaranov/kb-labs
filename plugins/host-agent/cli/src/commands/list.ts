/**
 * workspace:list command
 * List all connected Workspace Agents via Gateway REST API.
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

type ListInput = {
  json?: boolean;
  gateway?: string;
};

interface HostEntry {
  hostId: string;
  name: string;
  status: string;
  capabilities: string[];
  hostType?: string;
  lastSeen: number;
  connections: string[];
}

type ListResult = {
  exitCode: number;
  hosts: HostEntry[];
};

export default defineCommand({
  id: 'workspace:list',
  description: 'List all connected Workspace Agents',

  handler: {
    async execute(ctx: PluginContextV3, rawInput: ListInput): Promise<ListResult> {
      const input: ListInput = (rawInput as any).flags ?? rawInput;

      // Resolve Gateway URL: flag > agent config > env > default
      let gatewayUrl = input.gateway;
      if (!gatewayUrl) {
        try {
          const configPath = join(homedir(), '.kb', 'agent.json');
          const config = JSON.parse(readFileSync(configPath, 'utf-8'));
          gatewayUrl = config.gatewayUrl;
        } catch {
          // No agent config
        }
      }
      gatewayUrl = gatewayUrl ?? ctx.runtime?.env?.('KB_GATEWAY_URL') ?? 'http://localhost:4000';

      // Get auth token
      let token: string | undefined;
      try {
        const configPath = join(homedir(), '.kb', 'agent.json');
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        if (config.clientId && config.clientSecret) {
          const tokenRes = await fetch(`${gatewayUrl}/auth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: config.clientId, clientSecret: config.clientSecret }),
          });
          if (tokenRes.ok) {
            const body = await tokenRes.json() as { accessToken?: string };
            token = body.accessToken;
          }
        }
      } catch {
        // Auth failed — try without
      }

      // Fetch hosts
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      let hosts: HostEntry[] = [];
      try {
        const res = await fetch(`${gatewayUrl}/hosts`, { headers });
        if (res.ok) {
          const body = await res.json() as { hosts: HostEntry[] };
          hosts = body.hosts;
        } else {
          ctx.ui?.error?.(`Failed to list hosts: HTTP ${res.status}`);
          return { exitCode: 1, hosts: [] };
        }
      } catch (err) {
        ctx.ui?.error?.(`Cannot reach Gateway at ${gatewayUrl}: ${err instanceof Error ? err.message : String(err)}`);
        return { exitCode: 1, hosts: [] };
      }

      if (input.json) {
        ctx.ui?.json?.({ hosts });
        return { exitCode: 0, hosts };
      }

      if (hosts.length === 0) {
        ctx.ui?.info?.('No Workspace Agents connected.');
        return { exitCode: 0, hosts: [] };
      }

      // Format table
      const statusIcon = (s: string) => {
        switch (s) {
          case 'online': return '\u001b[32m●\u001b[0m';
          case 'reconnecting': return '\u001b[33m◐\u001b[0m';
          case 'degraded': return '\u001b[33m◐\u001b[0m';
          case 'offline': return '\u001b[31m○\u001b[0m';
          default: return '?';
        }
      };

      const ago = (ts: number) => {
        const sec = Math.floor((Date.now() - ts) / 1000);
        if (sec < 60) {return `${sec}s ago`;}
        if (sec < 3600) {return `${Math.floor(sec / 60)}m ago`;}
        if (sec < 86400) {return `${Math.floor(sec / 3600)}h ago`;}
        return `${Math.floor(sec / 86400)}d ago`;
      };

      const lines = hosts.map(h =>
        `  ${statusIcon(h.status)} ${h.name.padEnd(28)} ${h.status.padEnd(14)} ${(h.capabilities || []).join(', ').padEnd(30)} ${ago(h.lastSeen)}`
      );

      ctx.ui?.success?.('Workspace Agents', {
        sections: [{
          items: [
            `  ${'Name'.padEnd(30)} ${'Status'.padEnd(14)} ${'Capabilities'.padEnd(30)} Last Seen`,
            `  ${'─'.repeat(30)} ${'─'.repeat(14)} ${'─'.repeat(30)} ─────────`,
            ...lines,
            '',
            `  ${hosts.filter(h => h.status === 'online').length} online, ${hosts.filter(h => h.status === 'offline').length} offline (${hosts.length} total)`,
          ],
        }],
      });

      return { exitCode: 0, hosts };
    },
  },
});

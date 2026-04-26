/**
 * workspace:register command (alias: agent:register)
 * Register this machine with a Platform Gateway and save credentials to ~/.kb/agent.json.
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve, normalize } from 'node:path';
import { homedir, hostname } from 'node:os';

type RegisterInput = {
  gateway: string;
  name?: string;
  workspace?: string[];
  namespace?: string;
  json?: boolean;
  flags?: RegisterInput;
};

type RegisterResult = {
  exitCode: number;
  configPath?: string;
};

export default defineCommand({
  id: 'workspace:register',
  description: 'Register this machine with a Platform Gateway',

  handler: {
    async execute(ctx: PluginContextV3, rawInput: RegisterInput): Promise<RegisterResult> {
      const input: RegisterInput = rawInput.flags ?? rawInput;
      const gatewayUrl = (input.gateway ?? '').replace(/\/$/, '');
      const name = input.name ?? hostname();
      const namespaceId = input.namespace ?? 'default';
      const rawWorkspace = input.workspace;
      const rawPaths = rawWorkspace
        ? (Array.isArray(rawWorkspace) ? rawWorkspace : [rawWorkspace as unknown as string])
        : [process.cwd()];

      // Resolve and validate workspace paths: must be absolute directories, no traversal
      const workspacePaths: string[] = [];
      for (const p of rawPaths) {
        const resolved = resolve(normalize(p));
        let pathStat: Awaited<ReturnType<typeof stat>> | null = null;
        try { pathStat = await stat(resolved); } catch { /* will error below */ }
        if (!pathStat?.isDirectory()) {
          ctx.ui?.error?.(`Workspace path does not exist or is not a directory: ${resolved}`);
          return { exitCode: 1 };
        }
        workspacePaths.push(resolved);
      }

      if (!gatewayUrl) {
        ctx.ui?.error?.('--gateway is required. Example: kb workspace:register --gateway http://localhost:4000');
        return { exitCode: 1 };
      }

      // Validate URL
      if (!gatewayUrl.startsWith('http://') && !gatewayUrl.startsWith('https://')) {
        ctx.ui?.error?.('Invalid gateway URL — must start with http:// or https://');
        return { exitCode: 1 };
      }

      ctx.ui?.info?.(`Registering with Gateway: ${gatewayUrl}`);

      // POST /auth/register
      let res: Response;
      try {
        res = await fetch(`${gatewayUrl}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, namespaceId, capabilities: ['filesystem', 'git', 'execution', 'search', 'shell'] }),
        });
      } catch (err) {
        ctx.ui?.error?.(`Failed to reach Gateway: ${err instanceof Error ? err.message : String(err)}`);
        return { exitCode: 1 };
      }

      if (!res.ok) {
        const rawBody = await res.text().catch(() => '');
        const body = rawBody.slice(0, 200).replace(/[\r\n]/g, ' ');
        ctx.ui?.error?.(`Gateway returned ${res.status}: ${body}`);
        return { exitCode: 1 };
      }

      let data: { clientId?: string; clientSecret?: string; hostId?: string };
      try {
        data = await res.json() as typeof data;
      } catch {
        ctx.ui?.error?.('Gateway response is not valid JSON');
        return { exitCode: 1 };
      }

      if (!data.clientId || !data.clientSecret || !data.hostId) {
        ctx.ui?.error?.('Gateway response is missing required fields (clientId, clientSecret, hostId)');
        return { exitCode: 1 };
      }

      // Format validation — secrets must be non-empty strings with safe characters only
      const SECRET_PATTERN = /^[A-Za-z0-9_\-+/=]{16,}$/;
      if (typeof data.clientSecret !== 'string' || !SECRET_PATTERN.test(data.clientSecret)) {
        ctx.ui?.error?.('Gateway returned an invalid client secret (unexpected format)');
        return { exitCode: 1 };
      }

      // Write ~/.kb/agent.json
      const kbDir = join(homedir(), '.kb');
      await mkdir(kbDir, { recursive: true });
      const configPath = join(kbDir, 'agent.json');

      const agentConfig = {
        clientId: data.clientId,
        clientSecret: data.clientSecret,
        hostId: data.hostId,
        gatewayUrl,
        namespaceId,
        hostType: 'local' as const,
        workspacePaths,
        execution: {
          mode: 'in-process' as const,
          timeoutMs: 120_000,
        },
      };

      await writeFile(configPath, JSON.stringify(agentConfig, null, 2), { mode: 0o600 });

      if (input.json) {
        ctx.ui?.json?.({ configPath, hostId: data.hostId, clientId: data.clientId });
      } else {
        ctx.ui?.success?.('Workspace Agent registered', {
          sections: [{
            items: [
              `Host ID:    ${data.hostId}`,
              `Client ID:  ${data.clientId}`,
              `Gateway:    ${gatewayUrl}`,
              `Namespace:  ${namespaceId}`,
              `Workspaces: ${workspacePaths.join(', ')}`,
              `Config:     ${configPath}`,
            ],
          }],
        });
        ctx.ui?.info?.('Next: start the daemon with `pnpm dev:start:host-agent` or `kb workspace:start`.');
      }

      return { exitCode: 0, configPath };
    },
  },
});

/**
 * Mind verify command - checks platform services readiness (V3)
 */

import { defineCommand, usePlatform, type PluginContextV3 } from '@kb-labs/sdk';

interface VerifyInput {
  argv: string[];
  flags: {
    json?: boolean;
    quiet?: boolean;
  };
}

interface ServiceStatus {
  service: string;
  required: boolean;
  available: boolean;
  configured: boolean;
  message?: string;
}

interface VerifyResult {
  exitCode: number;
  ok: boolean;
  services: ServiceStatus[];
  issues: string[];
  meta: {
    timingMs: number;
  };
}

export default defineCommand({
  id: 'mind:verify',
  description: 'Check Mind platform services readiness',

  handler: {
    async execute(ctx: PluginContextV3, input: VerifyInput): Promise<VerifyResult> {
      const startTime = Date.now();
      const { flags } = input;

      ctx.trace?.addEvent?.('mind.verify.start', { command: 'mind:verify' });

      // Use global platform singleton
      const platform = usePlatform();
      const services: ServiceStatus[] = [];

      if (!platform) {
        const result: VerifyResult = {
          exitCode: 1,
          ok: false,
          services,
          issues: ['platform context is missing'],
          meta: { timingMs: Date.now() - startTime },
        };

        if (flags.json) {
          ctx.ui.info(JSON.stringify(result));
        } else {
          ctx.ui.error('Platform services are not available in this context');
        }

        ctx.trace?.addEvent?.('mind.verify.failed', { reason: 'no-platform' });
        return result;
      }

      const check = (
        name: string,
        required: boolean,
        available: boolean,
        configured: boolean,
        message?: string,
      ) => {
        services.push({ service: name, required, available, configured, message });
      };

      const has = (key: keyof typeof platform) => Boolean((platform as any)[key]);
      const isConfigured = (svc: string) => platform.isConfigured?.(svc) ?? has(svc as any);

      // Check required services
      check('vectorStore', true, has('vectorStore'), isConfigured('vectorStore'));
      check('embeddings', true, has('embeddings'), isConfigured('embeddings'));
      check('llm', false, has('llm'), isConfigured('llm'));
      check('cache', false, has('cache'), true);
      check('storage', false, has('storage'), true);
      check('analytics', false, has('analytics'), true);

      const requiredOk = services.filter(s => s.required).every(s => s.available && s.configured);
      const issues = services
        .filter(s => s.required && (!s.available || !s.configured))
        .map(s => `${s.service} is missing or not configured`);

      const timing = Date.now() - startTime;

      ctx.trace?.addEvent?.('mind.verify.complete', { ok: requiredOk, issues: issues.length });

      const result: VerifyResult = {
        exitCode: requiredOk ? 0 : 1,
        ok: requiredOk,
        services,
        issues,
        meta: { timingMs: timing },
      };

      if (flags.json) {
        ctx.ui.info(JSON.stringify(result));
      } else if (!flags.quiet) {
        const sections = [
          {
            header: 'Services',
            items: services.map(s => {
              const status = s.available && s.configured ? '✓' : '⚠';
              return `${status} ${s.service}: ${s.available ? 'available' : 'missing'}${s.configured ? '' : ' (not configured)'}`;
            }),
          },
        ];

        if (issues.length) {
          sections.push({
            header: 'Issues',
            items: issues.map(i => `⚠ ${i}`),
          });
        }

        // Use success with sections for both cases (no ctx.ui.warning in V3)
        if (requiredOk) {
          ctx.ui.success('Mind platform services verified', {
            title: 'Mind Verify - Platform',
            sections,
            timing,
          });
        } else {
          // Use error but show details via separate success call with sections
          ctx.ui.error('Mind platform services have issues');
          ctx.ui.success('Verification Details', {
            title: 'Mind Verify - Platform',
            sections,
            timing,
          });
        }
      }

      return result;
    },
  },
});

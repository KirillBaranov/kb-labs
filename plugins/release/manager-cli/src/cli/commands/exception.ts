/**
 * `kb release exception create` — the replacement for `--skip-checks`.
 *
 * The old flag was a boolean with no author, no scope, no expiry and no
 * artifact; nothing downstream could tell that a release had bypassed a gate.
 * This command produces a document instead, and the document is the record.
 *
 * Reason, TTL and operator identity are all mandatory. The trade is stated
 * plainly in the output because it is irreversible: the candidate this
 * exception names can never be promoted to stable, expiry or not (see
 * `isStablePromotionForbidden`). No second approval is required — decision
 * S0.3e — since the permanent loss of stable eligibility *is* the control.
 *
 * CI never receives an override flag; it cannot see this document at all.
 */

import {
  defineCommand,
  type CLIInput,
  type CommandResult,
  type PluginContextV3,
} from '@kb-labs/sdk';

import {
  DEFAULT_EXCEPTION_TTL_HOURS,
  RELEASE_CHECK_GROUPS,
  ReleaseExceptionError,
  createReleaseException,
} from '../../shared/control-plane/index.js';
import { findRepoRoot } from '../../shared/utils';

interface ExceptionFlags {
  candidate?: string;
  flow?: string;
  check?: string | string[];
  reason?: string;
  operator?: string;
  ttlHours?: number;
  json?: boolean;
}

function asList(value: string | string[] | undefined): string[] {
  if (!value) { return []; }
  return (Array.isArray(value) ? value : [value]).flatMap(entry => entry.split(',')).map(s => s.trim()).filter(Boolean);
}

export default defineCommand({
  id: 'release:exception:create',
  description: 'Create a break-glass check exception (replaces --skip-checks)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<ExceptionFlags>): Promise<CommandResult<unknown>> {
      const { flags } = input;
      const repoRoot = await findRepoRoot(ctx.cwd || process.cwd());

      const missing = (['candidate', 'flow', 'reason', 'operator'] as const)
        .filter(key => !flags[key]);
      const checkIds = asList(flags.check);
      if (checkIds.length === 0) { missing.push('check' as never); }

      if (missing.length > 0) {
        const message =
          `release exception create requires ${missing.join(', ')}. ` +
          `Known check ids: ${RELEASE_CHECK_GROUPS.map(check => check.id).join(', ')}.`;
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); }
        else { ctx.ui?.write?.(message); }
        return { ok: false, error: message };
      }

      try {
        const { exception, path } = createReleaseException({
          repoRoot,
          flow: flags.flow!,
          candidateId: flags.candidate!,
          checkIds,
          reason: flags.reason!,
          operator: flags.operator!,
          ttlHours: flags.ttlHours ?? DEFAULT_EXCEPTION_TTL_HOURS,
        });

        ctx.platform?.logger?.warn?.('Release check exception created', {
          exceptionId: exception.exceptionId,
          candidateId: exception.candidateId,
          checkIds: exception.checkIds,
          operator: exception.operator,
          stablePromotionForbidden: true,
        });

        const output = { ok: true as const, exception, path };
        if (flags.json) {
          ctx.ui?.json?.(output);
        } else {
          ctx.ui?.sideBox?.({
            title: 'Release Check Exception',
            sections: [
              {
                header: 'Waived',
                items: exception.checkIds.map(id => `- ${id}`),
              },
              {
                header: 'Terms',
                items: [
                  `Operator: ${exception.operator}`,
                  `Reason: ${exception.reason}`,
                  `Expires: ${exception.expiresAt}`,
                  'Stable promotion: PERMANENTLY FORBIDDEN for this candidate.',
                ],
              },
              { items: [`Written to ${path}`] },
            ],
            status: 'warning',
          });
        }
        return { ok: true, result: output };
      } catch (error) {
        const message = error instanceof ReleaseExceptionError
          ? error.message
          : `Failed to create exception: ${(error as Error).message}`;
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); }
        else { ctx.ui?.write?.(message); }
        return { ok: false, error: message };
      }
    },
  },
});

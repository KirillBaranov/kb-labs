/**
 * Channel policy (cutover plan §3, decision S0.3d).
 *
 * Three channels exist in the contracts and in the transition table; only two
 * are reachable in this cutover. `experimental` is rejected *here*, once, by
 * the plugin — rather than at each call site — so no surface can accidentally
 * accept it and no surface has to remember to.
 *
 * Also resolves the npm dist-tag and target registry for a channel, shared by
 * CLI (run.ts), REST (run-handler.ts) and the pipeline so "canary always goes
 * to real npm under a canary tag, stable uses whatever config.registry says"
 * is defined once, config-driven, not hardcoded at each call site.
 */
import { ReleaseControlDiagnosticCode } from '@kb-labs/release-manager-contracts';

import type { ReleaseChannel, ReleaseConfig } from './types';

const DEFAULT_NPM_REGISTRY = 'https://registry.npmjs.org';

export const RELEASE_CHANNELS: readonly ReleaseChannel[] = ['canary', 'stable', 'experimental'];

/** Channels the plugin will actually plan a release for in this cutover. */
export const PLANNABLE_RELEASE_CHANNELS: readonly ReleaseChannel[] = ['canary', 'stable'];

/**
 * Typed rejection so callers render a decision rather than parsing a message.
 *
 * Carrying the code on the error (not only in the text) is what lets the CLI,
 * REST and Workflow all distinguish "this channel does not exist" from "this
 * channel exists but is not available yet" without string matching.
 */
export class ReleaseChannelError extends Error {
  readonly code: ReleaseControlDiagnosticCode;
  readonly requestedTarget: string;

  constructor(code: ReleaseControlDiagnosticCode, requestedTarget: string, message: string) {
    super(message);
    this.name = 'ReleaseChannelError';
    this.code = code;
    this.requestedTarget = requestedTarget;
  }
}

export function isReleaseChannel(value: string): value is ReleaseChannel {
  return (RELEASE_CHANNELS as readonly string[]).includes(value);
}

/**
 * Validates a `--target`/`--channel` value and returns it narrowed.
 *
 * `experimental` is a *reject*, never a silent downgrade to canary: an operator
 * who asked for a channel that does not ship yet must be told, because the
 * alternative is publishing to a channel they did not choose.
 */
export function resolveRequestedChannel(requestedTarget: string): ReleaseChannel {
  if (!isReleaseChannel(requestedTarget)) {
    throw new ReleaseChannelError(
      ReleaseControlDiagnosticCode.UnknownChannel,
      requestedTarget,
      `Unknown release target "${requestedTarget}". Valid targets: ${RELEASE_CHANNELS.join(', ')}.`,
    );
  }
  if (requestedTarget === 'experimental') {
    throw new ReleaseChannelError(
      ReleaseControlDiagnosticCode.ExperimentalChannelUnavailable,
      requestedTarget,
      'The "experimental" channel is reserved but not available in this release contract. ' +
      'It exists in the schemas and the state table so the immutable contracts do not have to change later; ' +
      'no producer or consumer implements it yet. Use --target canary.',
    );
  }
  return requestedTarget;
}

/**
 * A candidate allocated on `experimental` can never become stable (§3).
 *
 * This is a separate guard from `resolveRequestedChannel` because it applies to
 * an *already-allocated* candidate rather than to a requested target — it is
 * the rule PR 5's promotion saga enforces against the ledger entry.
 */
export function assertPromotableToStable(sourceChannel: ReleaseChannel): void {
  if (sourceChannel === 'experimental') {
    throw new ReleaseChannelError(
      ReleaseControlDiagnosticCode.ExperimentalStableForbidden,
      'stable',
      'A candidate allocated on the experimental channel can never be promoted to stable.',
    );
  }
}

export function resolvePublishTag(config: ReleaseConfig, channel: ReleaseChannel): string {
  if (channel === 'canary') {
    return config.publish?.canaryTag ?? 'canary';
  }
  if (channel === 'experimental') {
    return config.publish?.experimentalTag ?? 'experimental';
  }
  return config.publish?.stableTag ?? 'latest';
}

export function resolvePublishRegistry(config: ReleaseConfig, channel: ReleaseChannel): string {
  if (channel === 'canary' || channel === 'experimental') {
    // Non-stable channels never read config.registry (that's the stable/Verdaccio
    // target) — a stale Verdaccio registry override must not swallow a canary publish.
    return config.publish?.npmRegistry ?? DEFAULT_NPM_REGISTRY;
  }
  return config.registry ?? DEFAULT_NPM_REGISTRY;
}

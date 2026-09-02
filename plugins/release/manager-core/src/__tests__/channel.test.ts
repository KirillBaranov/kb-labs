import { ReleaseControlChannelSchema, ReleaseControlDiagnosticCode } from '@kb-labs/release-manager-contracts';
import { describe, expect, it } from 'vitest';

import {
  PLANNABLE_RELEASE_CHANNELS,
  RELEASE_CHANNELS,
  ReleaseChannelError,
  assertPromotableToStable,
  isReleaseChannel,
  resolvePublishRegistry,
  resolvePublishTag,
  resolveRequestedChannel,
} from '../channel';
import type { ReleaseChannel } from '../types';

describe('release channels', () => {
  // The point of aliasing core's ReleaseChannel to the contract enum is that
  // there is nowhere for a second list to drift. This asserts the runtime half
  // of that (the type half is enforced by the alias itself).
  it('carries exactly the channel set the contract schema defines', () => {
    expect([...RELEASE_CHANNELS].sort()).toEqual([...ReleaseControlChannelSchema.options].sort());
  });

  it('accepts canary and stable as plannable targets', () => {
    expect([...PLANNABLE_RELEASE_CHANNELS].sort()).toEqual(['canary', 'stable']);
    expect(resolveRequestedChannel('canary')).toBe('canary');
    expect(resolveRequestedChannel('stable')).toBe('stable');
  });

  it('recognises experimental as a real channel — it exists in the contract', () => {
    expect(isReleaseChannel('experimental')).toBe(true);
  });

  // Decision S0.3d: the channel is reserved in the immutable contracts, but the
  // plugin rejects it. Rejecting rather than silently downgrading to canary is
  // the whole requirement — an operator must never publish to a channel they
  // did not ask for.
  it('rejects --target experimental with a typed diagnostic', () => {
    let thrown: unknown;
    try { resolveRequestedChannel('experimental'); } catch (error) { thrown = error; }

    expect(thrown).toBeInstanceOf(ReleaseChannelError);
    const error = thrown as ReleaseChannelError;
    expect(error.code).toBe(ReleaseControlDiagnosticCode.ExperimentalChannelUnavailable);
    expect(error.requestedTarget).toBe('experimental');
  });

  it('rejects an unknown target with a different code than experimental', () => {
    let thrown: unknown;
    try { resolveRequestedChannel('nightly'); } catch (error) { thrown = error; }
    expect((thrown as ReleaseChannelError).code).toBe(ReleaseControlDiagnosticCode.UnknownChannel);
  });

  it('forbids promoting an experimental candidate to stable', () => {
    expect(() => assertPromotableToStable('canary')).not.toThrow();
    expect(() => assertPromotableToStable('stable')).not.toThrow();

    let thrown: unknown;
    try { assertPromotableToStable('experimental'); } catch (error) { thrown = error; }
    expect((thrown as ReleaseChannelError).code)
      .toBe(ReleaseControlDiagnosticCode.ExperimentalStableForbidden);
  });

  it('resolves a distinct dist-tag and registry per channel', () => {
    const config = {};
    const tags = Object.fromEntries(
      RELEASE_CHANNELS.map(channel => [channel, resolvePublishTag(config, channel as ReleaseChannel)]),
    );
    expect(tags).toEqual({ canary: 'canary', stable: 'latest', experimental: 'experimental' });

    // Only stable reads config.registry — a stale Verdaccio override must not
    // swallow a canary (or, later, experimental) publish.
    const withVerdaccio = { registry: 'http://localhost:4873' };
    expect(resolvePublishRegistry(withVerdaccio, 'stable')).toBe('http://localhost:4873');
    expect(resolvePublishRegistry(withVerdaccio, 'canary')).toBe('https://registry.npmjs.org');
    expect(resolvePublishRegistry(withVerdaccio, 'experimental')).toBe('https://registry.npmjs.org');
  });
});

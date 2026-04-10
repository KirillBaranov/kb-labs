import { init, loadRemote, registerRemotes } from '@module-federation/runtime';
import type { StudioPluginEntryV2 } from './types.js';
import type { ComponentType } from 'react';
import { devToolsStore, GenericChannel } from '@kb-labs/studio-devtools';
import type { MFEvent } from '@kb-labs/studio-devtools';

/** MF events channel — registered lazily on first use */
function getMFChannel(): ReturnType<typeof devToolsStore.getChannel<MFEvent>> {
  let ch = devToolsStore.getChannel<MFEvent>('mf-events');
  if (!ch) {
    ch = new GenericChannel<MFEvent>('mf-events', 'MF Events', 'ApiOutlined');
    devToolsStore.registerChannel(ch);
  }
  return ch;
}

/**
 * Last known remoteEntryUrl per remoteName.
 * Updated on init and on each loadPageComponent call (lazy, navigation-triggered).
 */
const knownRemotes = new Map<string, string>();
let mfInitialized = false;

/**
 * Initialize Module Federation runtime. Called once after registry is first loaded.
 */
export function initFederation(plugins: StudioPluginEntryV2[]): void {
  if (mfInitialized) { return; }

  init({
    name: 'studioHost',
    remotes: plugins.map((plugin) => ({
      name: plugin.remoteName,
      entry: plugin.remoteEntryUrl,
    })),
  });

  mfInitialized = true;
  for (const p of plugins) {
    knownRemotes.set(p.remoteName, p.remoteEntryUrl);
  }
}

/**
 * Notify federation about the current remoteEntryUrl for a remote.
 * If the URL changed since last load (i.e. plugin was rebuilt), re-registers
 * the remote so the next loadRemote() fetches the fresh bundle.
 *
 * Called lazily at navigation time — never in background — so the running
 * page is never disrupted mid-session.
 */
export function syncRemoteEntry(remoteName: string, currentEntryUrl: string): void {
  if (knownRemotes.get(remoteName) === currentEntryUrl) { return; }

  registerRemotes([{ name: remoteName, entry: currentEntryUrl }], { force: true });
  knownRemotes.set(remoteName, currentEntryUrl);
}

/**
 * Reset federation state. For testing only.
 */
export function resetFederation(): void {
  knownRemotes.clear();
  mfInitialized = false;
}

/**
 * Error thrown when a remote widget fails to load.
 */
export class PageLoadError extends Error {
  readonly remoteName: string;
  readonly exposedModule: string;

  constructor(
    message: string,
    remoteName: string,
    exposedModule: string,
    cause?: Error,
  ) {
    super(message, { cause });
    this.name = 'PageLoadError';
    this.remoteName = remoteName;
    this.exposedModule = exposedModule;
  }
}

interface MFEventContext {
  id: string;
  remoteName: string;
  exposedModule: string;
  startedAt: number;
}

function pushMFEvent(
  ctx: MFEventContext,
  fields: Omit<MFEvent, 'id' | 'remoteName' | 'exposedModule' | 'startedAt'>,
): void {
  getMFChannel()?.push({ ...ctx, ...fields } as MFEvent);
}

function buildErrorPayload(err: unknown): { message: string; cause?: string } {
  return {
    message: err instanceof Error ? err.message : String(err),
    cause: err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined,
  };
}

/**
 * Load a page component from a Module Federation remote.
 * Retries on failure with backoff.
 *
 * @param remoteEntryUrl - Current remoteEntryUrl from registry. If it changed since
 *   the last load (plugin was rebuilt), the remote is re-registered before loading
 *   so the browser fetches the fresh bundle. This check happens at navigation time
 *   only — never in the background — so the active page is never disrupted.
 */
export async function loadPageComponent(
  remoteName: string,
  exposedModule: string,
  remoteEntryUrl?: string,
  retries = 2,
  retryDelay = 1000,
): Promise<{ default: ComponentType<unknown> }> {
  if (remoteEntryUrl) {
    syncRemoteEntry(remoteName, remoteEntryUrl);
  }

  const modulePath = `${remoteName}/${exposedModule.replace('./', '')}`;
  const ctx: MFEventContext = {
    id: `mf-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    remoteName,
    exposedModule,
    startedAt: Date.now(),
  };

  pushMFEvent(ctx, { status: 'loading', attempt: 1 });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const module = await loadRemote<{ default: ComponentType<unknown> }>(modulePath);
      if (!module) { throw new Error('Module resolved to null'); }

      if (module.default === undefined) {
        // Module loaded but has no default export — e.g. `export function X()` instead of `export default`
        pushMFEvent(ctx, { status: 'warning', durationMs: Date.now() - ctx.startedAt, attempt: attempt + 1, isDefaultUndefined: true });
        return module;
      }

      pushMFEvent(ctx, { status: 'success', durationMs: Date.now() - ctx.startedAt, attempt: attempt + 1 });
      return module;
    } catch (err) {
      if (attempt === retries) {
        pushMFEvent(ctx, { status: 'error', durationMs: Date.now() - ctx.startedAt, attempt: attempt + 1, error: buildErrorPayload(err) });
        throw new PageLoadError(
          `Failed to load page after ${retries + 1} attempts: ${modulePath}`,
          remoteName,
          exposedModule,
          err instanceof Error ? err : undefined,
        );
      }
      pushMFEvent(ctx, { status: 'loading', attempt: attempt + 2 });
      await new Promise<void>((resolve) => { setTimeout(resolve, retryDelay * (attempt + 1)); });
    }
  }

  // Unreachable
  throw new PageLoadError('Unreachable', remoteName, exposedModule);
}

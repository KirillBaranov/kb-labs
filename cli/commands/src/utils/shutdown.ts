import { platform } from '@kb-labs/core-runtime';

const log = platform.logger.child({ module: 'cli:shutdown' });

type ShutdownHook = () => void | Promise<void>;

const hooks = new Set<ShutdownHook>();
let signalsBound = false;
let exiting = false;

function bindSignals(): void {
  if (signalsBound) {
    return;
  }
  signalsBound = true;

  const handler = async (signal: NodeJS.Signals): Promise<void> => {
    if (exiting) {
      return;
    }
    exiting = true;
    for (const hook of Array.from(hooks)) {
      try {
        await hook();
      } catch (error) {
        log.warn(`Shutdown hook failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const exitCode = signal === 'SIGINT' ? 0 : 0;
    process.exit(exitCode);
  };

  ['SIGINT', 'SIGTERM'].forEach(signal => {
    process.once(signal as NodeJS.Signals, handler);
  });
}

export function registerShutdownHook(hook: ShutdownHook): () => void {
  hooks.add(hook);
  bindSignals();
  return () => {
    hooks.delete(hook);
  };
}

/**
 * Cross-platform socket path generation.
 *
 * - Unix/macOS: /tmp/kb-{id}.sock (Unix domain socket)
 * - Windows: \\?\pipe\kb-{id} (Named pipe — same net API, no code changes)
 *
 * Each path MUST be unique per process/execution to avoid collisions
 * between concurrent services (REST, workflow, CLI).
 */

/**
 * Generate a platform-appropriate socket/pipe path.
 *
 * @param id - Unique identifier (e.g., execution ID, process PID). Must be unique per socket.
 * @returns Socket path for Unix or named pipe path for Windows
 */
export function createSocketPath(id: string): string {
  if (process.platform === 'win32') {
    return `\\\\?\\pipe\\kb-${id}`;
  }
  return `/tmp/kb-${id}.sock`;
}

/**
 * Default socket path scoped to current process.
 * Includes PID to avoid collisions between concurrent services.
 */
export const DEFAULT_SOCKET_PATH = createSocketPath(`ipc-${process.pid}`);

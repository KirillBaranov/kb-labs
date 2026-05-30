/**
 * AsyncLocalStorage singleton for per-call plugin output capture.
 *
 * bootstrap.ts wires a uiProvider that reads from this store so each
 * callTool() invocation captures plugin UI output into its own isolated
 * buffer — concurrent calls never mix their output.
 *
 * Usage:
 *   // producer (callTool):
 *   const lines: string[] = [];
 *   await callOutput.run(lines, () => executeCommandV3(...));
 *   return lines.join('\n');
 *
 *   // consumer (uiProvider in bootstrap):
 *   uiProvider: () => {
 *     const lines = callOutput.getStore();
 *     return lines ? createBufferedUI((s) => lines.push(s)).ui : noopUI;
 *   }
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export const callOutput = new AsyncLocalStorage<string[]>();

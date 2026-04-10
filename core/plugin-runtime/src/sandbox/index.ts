/**
 * Sandbox module
 */

export {
  runInProcess,
  runInSubprocess,
  type RunInProcessOptions,
  type RunInSubprocessOptions,
} from './runner.js';

export {
  type ParentMessage,
  type ChildMessage,
  type ExecuteMessage,
  type AbortMessage,
  type ResultMessage,
  type ErrorMessage,
  type ReadyMessage,
  isParentMessage,
  isChildMessage,
} from './ipc-protocol.js';

export {
  connectToPlatform,
  disconnectFromPlatform,
} from './platform-client.js';

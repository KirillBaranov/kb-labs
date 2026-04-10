/**
 * @module @kb-labs/adapters-log-ringbuffer/manifest
 * Adapter manifest for log ring buffer extension.
 */

import type { AdapterManifest } from "@kb-labs/core-platform";

/**
 * Adapter manifest for log ring buffer extension.
 */
export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "log-ringbuffer",
  name: "Log Ring Buffer",
  version: "1.0.0",
  description: "In-memory ring buffer for real-time log streaming",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "extension",
  implements: "ILogRingBuffer",
  extends: {
    adapter: "logger",
    hook: "onLog",
    method: "append",
    priority: 10,
  },
  capabilities: {
    streaming: true,
  },
};

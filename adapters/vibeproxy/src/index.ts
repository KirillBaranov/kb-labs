/**
 * @module @kb-labs/adapters-vibeproxy
 * VibeProxy LLM adapter entry point.
 */

// Re-export LLM adapter as default
export { VibeProxyLLM, type VibeProxyLLMConfig, createAdapter } from "./llm.js";

// Re-export manifest
export { manifest } from "./manifest.js";

// Default export
export { createAdapter as default } from "./llm.js";

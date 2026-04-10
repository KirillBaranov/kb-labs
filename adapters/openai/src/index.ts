/**
 * @module @kb-labs/adapters-openai
 * OpenAI LLM adapter entry point.
 */

// Re-export LLM adapter as default
export { OpenAILLM, type OpenAILLMConfig, createAdapter } from "./llm.js";

// Re-export manifest
export { manifest } from "./manifest.js";

// Default export
export { createAdapter as default } from "./llm.js";

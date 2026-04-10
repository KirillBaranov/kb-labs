// Types
export type { PermissionSpec, PermissionPreset, PresetBuilder, RuntimePermissionSpec } from './types';

// Presets
export { minimal } from './presets/minimal';
export { gitWorkflow } from './presets/git-workflow';
export { npmPublish } from './presets/npm-publish';
export { fullEnv } from './presets/full-env';
export { kbPlatform } from './presets/kb-platform';
export { llmAccess } from './presets/llm-access';
export { vectorStore } from './presets/vector-store';
export { ciEnvironment } from './presets/ci-environment';

// Re-export all presets as a namespace
export * as presets from './presets/index.js';

// Builder
export { combine, combinePresets, toRuntimeFormat } from './combine';

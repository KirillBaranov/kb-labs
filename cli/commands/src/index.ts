/**
 * @kb-labs/cli-commands
 * Public surface: types, registry, findCommand, registerBuiltinCommands.
 * This package does not handle parsing argv/logging/exit.
 */
export * from "./registry/types";
export {
  registry,
  findCommand,
  findCommandWithType,
  type ProductGroup,
  type CommandType,
  type CommandLookupResult,
} from "./registry/service";
export { registerBuiltinCommands } from "./utils/register";
export * from "./utils/help-generator";
export { generateExamples, type ExampleCase } from "./utils/generate-examples";
export { TimingTracker } from "@kb-labs/shared-cli-ui";
export { discoverManifestsByNamespace, discoverManifests } from "./registry/discover";
export { hello } from "./commands/system/hello";
export { health } from "./commands/system/health";
export { version } from "./commands/system/version";

// Logs commands (agent-first log viewing and analysis)
export { logsDiagnose, logsContext, logsSummarize, logsQuery, logsSearch, logsGet, logsStats } from "./commands/system/logs";

/**
 * Plugin Manifest V3
 *
 * Declarative metadata for V3 plugin system.
 * Combines the best of V2 (declarative) with V3 architecture (sandboxed, type-safe).
 */

import type { PermissionSpec } from './permissions.js';
import type { HostType } from './host-context.js';
// ─── Studio V2 (Module Federation Pages) ───────────────────────────

/**
 * Studio configuration for plugin UI pages.
 * Each page is a Module Federation remote React component.
 * Plugin owns the entire page — full React, UIKit, hooks.
 */
export interface StudioConfig {
  /** Schema version (always 2) */
  version: 2;
  /** Module Federation remote name (e.g. 'commitPlugin') */
  remoteName: string;
  /** Page declarations */
  pages: StudioPageEntry[];
  /** Navigation menu entries */
  menus?: StudioMenuEntry[];
}

/**
 * A plugin page — one MF exposed React component.
 * Plugin is full owner inside the page.
 */
export interface StudioPageEntry {
  /** Unique page ID, dot-namespaced: 'commit.overview' */
  id: string;
  /** Human-readable title */
  title: string;
  /** Icon name (AntD icon names) */
  icon?: string;
  /** Route path: '/commit' */
  route: string;
  /** MF exposed module path: './CommitOverview' */
  entry: string;
  /** Required permissions to access this page */
  permissions?: string[];
  /** Render order in navigation */
  order?: number;
}

/**
 * Navigation menu entry for the Studio sidebar.
 */
export interface StudioMenuEntry {
  /** Unique menu item ID */
  id: string;
  /** Display label */
  label: string;
  /** Icon name (AntD icon names) */
  icon?: string;
  /** Target page ID or external URL */
  target: string;
  /** Render order */
  order?: number;
  /** Parent menu ID for nesting */
  parentId?: string;
  /** Required permissions */
  permissions?: string[];
  /** Badge text */
  badge?: string;
}

/**
 * Schema reference for input/output validation
 */
export type SchemaRef =
  | { $ref: string } // OpenAPI JSON Schema reference
  | { zod: string }; // Zod schema reference: './path/to/schema.ts#exportedSchema'

/**
 * Display metadata for plugin
 */
export interface DisplayMetadata {
  /** Plugin name (human-readable) */
  name: string;
  /** Plugin description */
  description?: string;
  /** Plugin author */
  author?: string;
  /** Plugin homepage URL */
  homepage?: string;
  /** Plugin repository URL */
  repository?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Plugin icon (URL or emoji) */
  icon?: string;
}

/**
 * Plugin dependency declaration
 */
export interface PluginDependency {
  /** Plugin ID (@scope/name) */
  id: string;
  /** Semver range (e.g., '^1.0.0', '>=2.0.0') */
  version: string;
  /** Optional dependency (plugin still loads if missing) */
  optional?: boolean;
}

/**
 * Platform service requirements
 */
export interface PlatformRequirements {
  /** Required services (plugin fails to load if missing) */
  requires?: Array<
    | 'vectorStore'
    | 'llm'
    | 'embeddings'
    | 'cache'
    | 'storage'
    | 'logger'
    | 'analytics'
  >;
  /** Optional services (features degraded if missing) */
  optional?: Array<string>;
}

/**
 * CLI command flag definition
 */
export interface CliFlagDecl {
  /** Flag name (e.g., 'verbose') */
  name: string;
  /** Flag type */
  type: 'string' | 'boolean' | 'number' | 'array';
  /** Short alias (e.g., 'v' for '--verbose') */
  alias?: string;
  /** Default value */
  default?: unknown;
  /** Description */
  description?: string;
  /** Allowed values (enum) */
  choices?: string[];
  /** Required flag */
  required?: boolean;
}

/**
 * CLI command declaration
 */
export interface CliCommandDecl {
  /** Unique command identifier (e.g., 'hello', 'ai-review:review') */
  id: string;
  /** Command group (e.g., 'marketplace') */
  group?: string;
  /** Subgroup within the group (e.g., 'plugins' → `kb marketplace plugins <id>`) */
  subgroup?: string;
  /** Short description */
  describe: string;
  /** Long description (for --help) */
  longDescription?: string;
  /** Command flags */
  flags?: CliFlagDecl[];
  /** Usage examples */
  examples?: string[];
  /** Handler file path relative to plugin root (e.g., './dist/commands/hello.js') */
  handler: string;
  /** Handler path (legacy/optional, used by V3 adapter for resolving handler location) */
  handlerPath?: string;
  /** Command-specific permissions (overrides plugin defaults) */
  permissions?: PermissionSpec;
}

/**
 * Metadata for CLI groups/subgroups — used for help display.
 */
export interface CliGroupMeta {
  /** Group path (e.g., "marketplace" or "marketplace/plugins") */
  name: string;
  /** Human-readable description */
  describe: string;
}

/**
 * REST route error specification
 */
export interface ErrorSpec {
  /** Error code (e.g., 'CONFIG_NOT_RESOLVED') */
  code: string;
  /** HTTP status code (400-599) */
  http: number;
  /** Human-readable description */
  description?: string;
}

/**
 * REST route declaration
 */
export interface RestRouteDecl {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Route path (relative to basePath, e.g., '/search') */
  path: string;
  /** Human-readable description for OpenAPI docs */
  description?: string;
  /** Route-specific timeout in milliseconds */
  timeoutMs?: number;
  /** Input schema (body for POST/PUT/PATCH, query for GET) */
  input?: SchemaRef;
  /** Output schema */
  output?: SchemaRef;
  /** Declared error responses */
  errors?: ErrorSpec[];
  /** Handler file path relative to plugin root (e.g., './dist/rest/search.js') */
  handler: string;
  /** Security requirements */
  security?: ('none' | 'user' | 'token' | 'oauth')[];
  /** Route-specific permissions (overrides plugin defaults) */
  permissions?: PermissionSpec;
}

/**
 * REST API configuration
 */
export interface RestConfig {
  /** Base path for all routes (e.g., '/v1/plugins/mind') */
  basePath?: `/v1/plugins/${string}`;
  /** Default route behaviour */
  defaults?: {
    /** Default timeout for routes (milliseconds) */
    timeoutMs?: number;
  };
  /** Route declarations */
  routes: RestRouteDecl[];
}

/**
 * WebSocket channel declaration
 */
export interface WebSocketChannelDecl {
  /** Channel path (e.g., '/live', '/chat') */
  path: string;

  /** Human-readable description */
  description?: string;

  /** Channel-specific protocol/subprotocol */
  protocol?: string;

  /** Handler file path relative to plugin root (e.g., './dist/ws/live-handler.js') */
  handler: string;

  /** Input message schema (client → server) */
  inputMessage?: SchemaRef;

  /** Output message schema (server → client) */
  outputMessage?: SchemaRef;

  /** Channel-specific permissions (overrides plugin defaults) */
  permissions?: PermissionSpec;

  /** Connection timeout in milliseconds */
  timeoutMs?: number;

  /** Max message size in bytes */
  maxMessageSize?: number;

  /** Authentication requirement */
  auth?: 'none' | 'token' | 'session';

  /** Idle timeout (auto-disconnect after this many ms of inactivity) */
  idleTimeoutMs?: number;
}

/**
 * WebSocket configuration in manifest
 */
export interface WebSocketConfig {
  /** Base path for all channels (e.g., '/v1/ws/plugins/commit') */
  basePath?: `/v1/ws/plugins/${string}`;

  /** Default settings for all channels */
  defaults?: {
    /** Default connection timeout (milliseconds) */
    timeoutMs?: number;
    /** Default max message size (bytes) */
    maxMessageSize?: number;
    /** Default auth requirement */
    auth?: 'none' | 'token' | 'session';
    /** Default idle timeout (milliseconds) */
    idleTimeoutMs?: number;
  };

  /** Channel declarations */
  channels: WebSocketChannelDecl[];
}

/**
 * Workflow handler declaration
 */
export interface WorkflowHandlerDecl {
  /** Unique workflow identifier (e.g., 'sync-dependencies') */
  id: string;
  /** Human-readable description */
  describe?: string;
  /** Handler file path relative to plugin root (e.g., './dist/workflows/sync.js') */
  handler: string;
  /** Input schema */
  input?: SchemaRef;
  /** Output schema */
  output?: SchemaRef;
  /** Handler-specific permissions */
  permissions?: PermissionSpec;
}

/**
 * Workflow template declaration — static YAML workflow bundled with plugin.
 * Registered in the workflow engine registry and runnable via `kb workflow run`.
 */
export interface WorkflowTemplateDecl {
  /** Unique template ID within the plugin (e.g. 'full-release') */
  id: string;
  /** Human-readable description */
  describe?: string;
  /** Path to YAML workflow file relative to plugin root (e.g. './workflows/templates/full-release.yaml') */
  path: string;
  /** Optional tags for filtering */
  tags?: string[];
}

/**
 * Webhook handler declaration
 */
export interface WebhookHandlerDecl {
  /** Event pattern (e.g., 'github:push', 'slack:message') */
  event: string;
  /** Human-readable description */
  describe?: string;
  /** Handler file path relative to plugin root (e.g., './dist/webhooks/github.js') */
  handler: string;
  /** Input schema (webhook payload) */
  input?: SchemaRef;
  /** Handler-specific permissions */
  permissions?: PermissionSpec;
}

/**
 * Job handler declaration for background task execution
 *
 * Job handlers are executed in sandboxed subprocess when submitted via ctx.api.jobs.submit()
 * These are different from scheduled jobs (JobDecl) - handlers are invoked on-demand.
 *
 * @example
 * ```json
 * {
 *   "jobs": {
 *     "handlers": [
 *       {
 *         "id": "send-email",
 *         "handler": "./dist/jobs/send-email.js",
 *         "describe": "Send email via SendGrid",
 *         "timeout": 30000,
 *         "maxRetries": 3
 *       }
 *     ]
 *   }
 * }
 * ```
 */
export interface JobHandlerDecl {
  /** Unique job identifier (e.g., 'send-email', 'process-file') */
  id: string;

  /** Human-readable description */
  describe?: string;

  /** Handler file path relative to plugin root (e.g., './dist/jobs/send-email.js') */
  handler: string;

  /** Input schema for validation */
  input?: SchemaRef;

  /** Output schema */
  output?: SchemaRef;

  /** Job-specific timeout in milliseconds (overrides defaults) */
  timeout?: number;

  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;

  /** Retry backoff strategy */
  retryBackoff?: 'exp' | 'lin';

  /** Handler-specific permissions (can access what?) */
  permissions?: PermissionSpec;
}

/**
 * Jobs configuration in manifest
 */
export interface JobsConfig {
  /** Job handler declarations */
  handlers: JobHandlerDecl[];

  /** Default settings for all jobs */
  defaults?: {
    /** Default timeout in milliseconds */
    timeout?: number;
    /** Default max retries */
    maxRetries?: number;
    /** Default backoff strategy */
    retryBackoff?: 'exp' | 'lin';
  };
}

/**
 * Cron schedule declaration for recurring tasks
 *
 * @example
 * ```json
 * {
 *   "cron": {
 *     "schedules": [
 *       {
 *         "id": "daily-cleanup",
 *         "schedule": "0 3 * * *",
 *         "job": {
 *           "type": "cleanup-logs",
 *           "payload": { "olderThanDays": 7 }
 *         }
 *       }
 *     ]
 *   }
 * }
 * ```
 */
export interface CronDecl {
  /** Unique cron schedule identifier (e.g., 'daily-cleanup') */
  id: string;

  /** Cron expression ('0 * * * *') or interval ('5m', '1h', '1d') */
  schedule: string;

  /** Job to execute on schedule */
  job: {
    /** Job type (pluginId:jobId or just jobId for same plugin) */
    type: string;
    /** Job payload */
    payload?: unknown;
  };

  /** Human-readable description */
  describe?: string;

  /** Whether schedule is enabled by default */
  enabled?: boolean;

  /** Timezone for cron expression (default: UTC) */
  timezone?: string;

  /** Cron-specific permissions */
  permissions?: PermissionSpec;
}

/**
 * @deprecated Use CronDecl instead (renamed for clarity)
 */
export type JobDecl = CronDecl;

/**
 * Lifecycle hook specification
 */
export interface LifecycleHooks {
  /** Handler executed when plugin loads (initialization) */
  onLoad?: string;
  /** Handler executed when plugin unloads (cleanup) */
  onUnload?: string;
  /** Handler executed when plugin is enabled */
  onEnable?: string;
  /** Handler executed when plugin is disabled */
  onDisable?: string;
}

/**
 * Setup command specification
 */
export interface SetupSpec {
  /** Handler file path for setup (e.g., './dist/setup.js') */
  handler: string;
  /** Human-readable description */
  describe: string;
  /** Setup-specific permissions (usually broader than runtime) */
  permissions: PermissionSpec;
}

/**
 * Plugin Manifest V3
 *
 * Declarative metadata for plugin capabilities, handlers, and requirements.
 *
 * @example kb.plugin.json
 * ```json
 * {
 *   "schema": "kb.plugin/3",
 *   "id": "@kb-labs/my-plugin",
 *   "version": "1.0.0",
 *   "display": {
 *     "name": "My Plugin",
 *     "description": "Does cool things"
 *   },
 *   "permissions": {
 *     "fs": { "mode": "read", "allow": [".kb/**"] },
 *     "net": { "allowHosts": ["api.example.com"] }
 *   },
 *   "cli": {
 *     "commands": [{
 *       "id": "hello",
 *       "describe": "Say hello",
 *       "handler": "./dist/commands/hello.js",
 *       "flags": []
 *     }]
 *   }
 * }
 * ```
 */
export interface ManifestV3 {
  /** Schema version */
  schema: 'kb.plugin/3';

  /** Plugin identifier (@scope/name) */
  id: string;

  /** Plugin version (semver) */
  version: string;

  /**
   * Config section identifier in kb.config.json
   * Used by runtime to load plugin-specific config
   * @example 'mind' maps to kb.config.json → profiles[].products.mind
   */
  configSection?: string;

  /** Display metadata */
  display?: DisplayMetadata;

  /** Plugin-wide permission defaults */
  permissions?: PermissionSpec;

  /** Plugin dependencies */
  dependencies?: PluginDependency[];

  /** Platform service requirements */
  platform?: PlatformRequirements;

  /** Setup command (runs during installation/initialization) */
  setup?: SetupSpec;

  /** Lifecycle hooks (onLoad, onUnload, onEnable, onDisable) */
  lifecycle?: LifecycleHooks;

  /** CLI commands */
  cli?: {
    commands: CliCommandDecl[];
    /** Descriptions for groups/subgroups (for help display) */
    groupMeta?: CliGroupMeta[];
  };

  /** REST API routes */
  rest?: RestConfig;

  /** WebSocket channels (real-time bidirectional communication) */
  ws?: WebSocketConfig;

  /** Workflow handlers (multi-step orchestration) */
  workflows?: {
    handlers: WorkflowHandlerDecl[];
    /** Static YAML workflow templates bundled with the plugin */
    templates?: WorkflowTemplateDecl[];
  };

  /** Webhook handlers */
  webhooks?: {
    handlers: WebhookHandlerDecl[];
  };

  /** Background job handlers (single-step tasks, invoked on-demand via ctx.api.jobs.submit) */
  jobs?: JobsConfig;

  /** Cron scheduled tasks (recurring jobs on schedule) */
  cron?: {
    /** Cron schedule declarations */
    schedules: CronDecl[];
  };

  /** Studio pages (Module Federation remotes) */
  studio?: StudioConfig;
}

/**
 * Type guard to check if manifest is V3
 */
export function isManifestV3(manifest: unknown): manifest is ManifestV3 {
  return (
    typeof manifest === 'object' &&
    manifest !== null &&
    'schema' in manifest &&
    manifest.schema === 'kb.plugin/3'
  );
}

/**
 * Get handler path for specific command/route/workflow
 */
export function getHandlerPath(
  manifest: ManifestV3,
  host: HostType,
  id: string
): string | undefined {
  switch (host) {
    case 'cli':
      return manifest.cli?.commands.find((cmd) => cmd.id === id)?.handler;
    case 'rest':
      return manifest.rest?.routes.find(
        (route) => `${route.method} ${route.path}` === id
      )?.handler;
    case 'ws':
      return manifest.ws?.channels.find((ch) => ch.path === id)?.handler;
    case 'workflow':
      return manifest.workflows?.handlers.find((h) => h.id === id)?.handler;
    case 'webhook':
      return manifest.webhooks?.handlers.find((h) => h.event === id)?.handler;
    default:
      return undefined;
  }
}

/**
 * Get permissions for specific handler
 */
export function getHandlerPermissions(
  manifest: ManifestV3,
  host: HostType,
  id: string
): PermissionSpec {
  // Get handler-specific permissions
  let handlerPerms: PermissionSpec | undefined;

  switch (host) {
    case 'cli':
      handlerPerms = manifest.cli?.commands.find((cmd) => cmd.id === id)
        ?.permissions;
      break;
    case 'rest':
      handlerPerms = manifest.rest?.routes.find(
        (route) => `${route.method} ${route.path}` === id
      )?.permissions;
      break;
    case 'ws':
      handlerPerms = manifest.ws?.channels.find((ch) => ch.path === id)
        ?.permissions;
      break;
    case 'workflow':
      handlerPerms = manifest.workflows?.handlers.find((h) => h.id === id)
        ?.permissions;
      break;
    case 'webhook':
      handlerPerms = manifest.webhooks?.handlers.find((h) => h.event === id)
        ?.permissions;
      break;
  }

  // Merge with plugin-wide defaults
  return {
    ...manifest.permissions,
    ...handlerPerms,
  };
}

// ── Service Manifest ────────────────────────────────────────────────────────

/**
 * ServiceManifest describes a standalone HTTP/WebSocket service
 * that can be managed by kb-dev (start/stop/restart/health).
 *
 * Schema: `kb.service/1`
 *
 * Each service declares how to start itself, what port it listens on,
 * and what health check endpoint to probe. kb-create uses this to
 * generate `devservices.yaml` automatically after installation.
 *
 * @example
 * ```ts
 * export const manifest: ServiceManifest = {
 *   schema: 'kb.service/1',
 *   id: 'rest',
 *   name: 'REST API',
 *   version: '1.2.0',
 *   description: 'Platform REST API daemon',
 *   runtime: {
 *     entry: 'dist/index.js',
 *     port: 5050,
 *     healthCheck: '/api/v1/health',
 *   },
 *   dependsOn: ['qdrant'],
 * };
 * ```
 */
export interface ServiceManifest {
  /** Schema version identifier */
  schema: 'kb.service/1';

  /** Unique service identifier (used as key in devservices.yaml) */
  id: string;

  /** Human-readable service name */
  name: string;

  /** Service version (semver) */
  version: string;

  /** Optional description */
  description?: string;

  /** Display metadata (reuses plugin DisplayMetadata) */
  display?: DisplayMetadata;

  /** How to run this service */
  runtime: ServiceRuntime;

  /** Service IDs this service depends on (for startup ordering) */
  dependsOn?: string[];

  /** Environment variables required/supported */
  env?: Record<string, ServiceEnvVar>;
}

/** Describes how kb-dev should start and monitor the service. */
export interface ServiceRuntime {
  /** Entrypoint relative to package root (e.g. "dist/index.js") */
  entry: string;

  /** TCP port the service listens on */
  port: number;

  /** Health check path (appended to http://localhost:<port>) */
  healthCheck: string;

  /** Protocol: "http" (default) or "ws" */
  protocol?: 'http' | 'ws';
}

/** Describes an environment variable the service uses. */
export interface ServiceEnvVar {
  /** Description of what this env var controls */
  description?: string;
  /** Default value (if any) */
  default?: string;
  /** Whether the service requires this env var to start */
  required?: boolean;
}

/**
 * Type guard to check if manifest is a ServiceManifest.
 */
export function isServiceManifest(manifest: unknown): manifest is ServiceManifest {
  return (
    typeof manifest === 'object' &&
    manifest !== null &&
    'schema' in manifest &&
    manifest.schema === 'kb.service/1'
  );
}

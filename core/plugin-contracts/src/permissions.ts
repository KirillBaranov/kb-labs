/**
 * Permission specification for V3 Plugin System
 *
 * Permissions define what resources and operations a plugin can access.
 * They are declared in the plugin manifest and can be restricted by user config.
 *
 * Design principles:
 * - Plugins declare what they WANT (allow-list only)
 * - Platform enforces hardcoded security (node_modules, .git, .env, etc.)
 * - Users can further restrict via kb.config.json (future)
 */
export interface PermissionSpec {
  /**
   * Filesystem permissions
   */
  fs?: {
    /** Directories/patterns allowed for reading (relative to cwd or absolute) */
    read?: string[];
    /** Directories/patterns allowed for writing (relative to cwd or absolute) */
    write?: string[];
  };

  /**
   * Network permissions
   */
  network?: {
    /** Allowed URL patterns for fetch (glob: *, **.domain.com, etc.) */
    fetch?: string[];
  };

  /**
   * Environment variable permissions
   */
  env?: {
    /** Allowed env variable patterns (exact or prefix with *) */
    read?: string[];
  };

  /**
   * Platform service permissions
   */
  platform?: {
    /** LLM access */
    llm?: boolean | { models?: string[] };
    /** Vector store access */
    vectorStore?: boolean | { collections?: string[] };
    /** Cache access */
    cache?: boolean | { namespaces?: string[] };
    /** Storage access */
    storage?: boolean | { paths?: string[] };
    /** Analytics access */
    analytics?: boolean;
    /** Embeddings access */
    embeddings?: boolean;
    /** Event bus access */
    events?: boolean | { publish?: string[]; subscribe?: string[] };
    /** Workflow engine access */
    workflows?: boolean | {
      /** Can start workflows */
      run?: boolean;
      /** Can list workflows */
      list?: boolean;
      /** Can cancel workflows */
      cancel?: boolean;
      /** Allowed workflow IDs (glob patterns: 'my-workflow', 'analytics-*', '*' for all) */
      workflowIds?: string[];
    };
    /** Job scheduler access */
    jobs?: boolean | {
      /** Can submit jobs */
      submit?: boolean;
      /** Can schedule jobs */
      schedule?: boolean;
      /** Can list jobs */
      list?: boolean;
      /** Can cancel jobs */
      cancel?: boolean;
      /** Allowed job types (glob patterns: 'send-email', 'cleanup-*', '*' for all) */
      types?: string[];
    };
    /** Cron scheduler access */
    cron?: boolean | {
      /** Can register cron jobs */
      register?: boolean;
      /** Can unregister cron jobs */
      unregister?: boolean;
      /** Can list cron jobs */
      list?: boolean;
      /** Can manually trigger cron jobs */
      trigger?: boolean;
      /** Can pause cron jobs */
      pause?: boolean;
      /** Can resume cron jobs */
      resume?: boolean;
    };
    /** Environment lifecycle access */
    environment?: boolean | {
      /** Can create/provision environments */
      create?: boolean;
      /** Can read environment status */
      read?: boolean;
      /** Can destroy environments */
      destroy?: boolean;
      /** Can renew environment leases */
      renewLease?: boolean;
      /** Allowed environment templates (glob patterns, optional scope for create) */
      templates?: string[];
      /** Allowed namespaces for environment operations */
      namespaces?: string[];
    };
    /** Workspace lifecycle access */
    workspace?: boolean | {
      /** Can materialize workspaces */
      materialize?: boolean;
      /** Can attach workspaces to environments */
      attach?: boolean;
      /** Can release workspace attachments */
      release?: boolean;
      /** Can read workspace status */
      read?: boolean;
      /** Allowed workspace sources (glob patterns, optional scope for materialize) */
      sources?: string[];
      /** Allowed workspace paths (glob patterns, optional scope for materialize/attach) */
      paths?: string[];
      /** Allowed namespaces for workspace operations */
      namespaces?: string[];
    };
    /** Snapshot lifecycle access */
    snapshot?: boolean | {
      /** Can capture snapshots */
      capture?: boolean;
      /** Can restore snapshots */
      restore?: boolean;
      /** Can delete snapshots */
      delete?: boolean;
      /** Can read snapshot status */
      read?: boolean;
      /** Can run snapshot garbage collection */
      garbageCollect?: boolean;
      /** Allowed snapshot namespaces (glob patterns for capture/gc) */
      namespaces?: string[];
    };
    /** Execution target access */
    execution?: boolean | {
      /** Can use explicit execution target affinity */
      targetUse?: boolean;
      /** Allowed target namespaces (glob patterns) */
      namespaces?: string[];
    };
  };

  /**
   * Shell execution permissions
   */
  shell?: {
    /** Whitelist of allowed commands (empty = shell disabled) */
    allow?: string[];
  };

  /**
   * Plugin invocation permissions
   */
  invoke?: {
    /** Whitelist of plugin IDs that can be invoked (empty = invoke disabled) */
    allow?: string[];
  };

  /**
   * State Broker permissions
   */
  state?: {
    /** Allowed namespace patterns (e.g., 'mind:*', 'workflow:*') */
    namespaces?: string[];
    /** State-specific quotas */
    quotas?: {
      /** Maximum number of entries */
      maxEntries?: number;
      /** Maximum total size in bytes */
      maxSizeBytes?: number;
      /** Operations per minute limit */
      operationsPerMinute?: number;
    };
  };

  /**
   * Resource quotas
   */
  quotas?: {
    /** Timeout in milliseconds */
    timeoutMs?: number;
    /** Memory limit in MB */
    memoryMb?: number;
    /** CPU time limit in ms */
    cpuMs?: number;
  };
}

/**
 * Default permissions (secure by default)
 */
export const DEFAULT_PERMISSIONS: PermissionSpec = {
  fs: {
    read: ['.'], // cwd only
    write: [], // Only outdir (added by runtime)
  },
  network: {
    fetch: [], // No network by default
  },
  env: {
    read: [], // Only NODE_ENV, CI, DEBUG (always allowed by runtime)
  },
  platform: {
    llm: false,
    vectorStore: false,
    cache: false,
    storage: false,
    analytics: false,
    embeddings: false,
    events: false,
    workflows: false,
    jobs: false,
    cron: false,
    environment: false,
    workspace: false,
    snapshot: false,
    execution: false,
  },
  shell: {
    allow: [], // No shell by default
  },
  invoke: {
    allow: [], // No invoke by default
  },
  state: {
    namespaces: [], // No state access by default
  },
};

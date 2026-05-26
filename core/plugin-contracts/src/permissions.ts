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
    /**
     * Raw TCP connect targets (host:port patterns).
     *
     * @example
     * tcp: { connect: ['imap.gmail.com:993', '*.smtp.example.com:587'] }
     */
    tcp?: { connect?: string[] };
    /**
     * WebSocket connect targets (URL patterns).
     *
     * @example
     * ws: { connect: ['wss://api.openai.com', 'wss://*.slack.com'] }
     */
    ws?: { connect?: string[] };
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
    /**
     * Notifier access — emit and/or subscribe to the notification stream.
     *
     * There is no "full access" shorthand. All permissions must be declared explicitly.
     * The runtime overwrites `source` with the pluginId on every emit — plugins cannot fake origin.
     * Subscribe constraints are enforced as a hard ceiling at the governed layer:
     * the plugin sees only what it declared, regardless of the filter it passes at runtime.
     *
     * @example
     * // emit only
     * notifier: { emit: true }
     *
     * // subscribe to specific plugin + severity
     * notifier: { subscribe: { sources: ['workflow-engine'], severity: ['critical'] } }
     *
     * // explicit wildcard (maximum privilege — visible in manifest review)
     * notifier: { emit: true, subscribe: { sources: ['*'], severity: ['info', 'warn', 'critical'] } }
     */
    notifier?: {
      /** Can emit notifications. */
      emit?: boolean;
      /**
       * Subscribe scope. Absent = cannot subscribe.
       * sources: ['*'] = all sources (explicit wildcard, requires justification in manifest).
       * severity absent = all severities allowed within declared sources.
       */
      subscribe?: {
        /** Plugin IDs allowed to receive notifications from. Use ['*'] for all sources. */
        sources: string[];
        /** Severity levels to receive. Absent = all severities. */
        severity?: Array<'info' | 'warn' | 'critical'>;
      };
    };
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

    /**
     * Storage abstractions (`IDocumentDatabase`, `IKVStore`).
     *
     * Two separate sub-permissions; declare only what the plugin needs.
     * Absent / `false` for a sub-permission means the platform serves a
     * deny stub — every call throws `PermissionError`.
     *
     * Collections / keys are namespaced per plugin under the hood. Without
     * grants a plugin only sees its own data. Cross-plugin access is opt-in
     * via the bidirectional `access` mechanism described below.
     */
    database?: {
      /**
       * Document database access.
       *
       * @example
       * // Plugin owns two collections; no cross-plugin access.
       * database: { document: { owns: ['runs', 'steps'] } }
       *
       * @example
       * // Plugin reads users from `auth` (auth must export it).
       * database: {
       *   document: {
       *     owns: ['invoices'],
       *     access: [{ collection: 'users', owner: 'auth', ops: ['read'] }],
       *   },
       * }
       *
       * @example
       * // Plugin needs to create / migrate its own collections at startup.
       * database: { document: { owns: ['runs'], ddl: { ownCollections: true } } }
       */
      document?: {
        /**
         * Collections owned by this plugin. Full CRUD is allowed on every
         * listed collection. `ensureCollection` requires `ddl.ownCollections`.
         *
         * Collection names are namespaced under the plugin: a plugin asking
         * for `"runs"` actually sees `<pluginId>__runs` on disk. Names in
         * this list MUST NOT contain `__`.
         */
        owns?: string[];

        /**
         * Read / write into collections owned by other plugins.
         *
         * The grant is bidirectional: the owning plugin MUST also declare
         * `exports.collections` for the listed collection (see plugin
         * manifest), otherwise `install` fails. This prevents one plugin
         * from silently asserting access to another plugin's data.
         */
        access?: Array<{
          /** Collection name as exposed by the owner (no namespace prefix). */
          collection: string;
          /** PluginId that owns the collection and must export it. */
          owner: string;
          /** Operations granted: `read` covers find/findById/count/findStream; `write` covers insert/update/delete/bulkWrite. */
          ops: Array<'read' | 'write'>;
        }>;

        /**
         * DDL surface. `ensureCollection` is treated as a separate privilege
         * because it can create indexes, including unique indexes that affect
         * subsequent writes.
         */
        ddl?: {
          /** Allow `ensureCollection` for collections in `owns`. Default: false. */
          ownCollections?: boolean;
        };
      };

      /**
       * KV store access. Keys live in a per-plugin namespace — the wrapper
       * prefixes every key with `<pluginId>:`, so two plugins setting
       * `"counter"` do not collide. Cross-plugin reads are NOT supported
       * (use `IInvoke` for plugin-to-plugin communication instead).
       *
       * Empty object = "this plugin uses KV". A `boolean` shorthand is
       * intentionally NOT accepted because future scope flags
       * (e.g. quotas) attach to the object form.
       */
      kvStore?: Record<string, never>;
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
    tcp: { connect: [] },
    ws: { connect: [] },
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

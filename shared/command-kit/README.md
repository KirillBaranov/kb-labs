# @kb-labs/shared-command-kit

> **Complete toolkit for building KB Labs CLI commands and plugins**

Fast, type-safe command development with platform service access, validation helpers, and common patterns.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Command Definition](#command-definition)
  - [defineCommand](#definecommand)
  - [defineSystemCommand](#definesystemcommand)
- [Manifest Definition](#manifest-definition)
  - [defineManifest](#definemanifest)
  - [defineCommandFlags](#definecommandflags)
- [Permission Presets](#permission-presets)
  - [Permission Combiners](#permission-combiners)
  - [Available Presets](#available-presets)
- [Error Factory](#error-factory)
  - [Basic Usage](#basic-usage)
  - [Common Error Definitions](#common-error-definitions)
  - [Error Type Guards](#error-type-guards)
- [Schema Builders](#schema-builders)
  - [Basic Usage](#basic-usage-1)
  - [Available Builders](#available-builders)
- [REST Handler Definition](#rest-handler-definition)
  - [Basic Usage](#basic-usage-2)
  - [Enhanced Context Helpers](#enhanced-context-helpers)
  - [Error Handling](#error-handling)
  - [Widget Card Helpers](#widget-card-helpers)
- [Lifecycle Helpers](#lifecycle-helpers)
  - [Setup Handler](#setup-handler)
  - [Destroy Handler](#destroy-handler)
- [Platform Service Helpers](#platform-service-helpers)
  - [Service Access](#service-access)
  - [Shortcuts](#shortcuts)
  - [Configuration Checking](#configuration-checking)
- [Validation Helpers](#validation-helpers)
  - [Common Schemas](#common-schemas)
  - [Validation Functions](#validation-functions)
  - [Type Guards](#type-guards)
- [Common Patterns](#common-patterns)
  - [Spinner Pattern](#spinner-pattern)
  - [Batch Processing](#batch-processing)
  - [Retry Logic](#retry-logic)
  - [Utilities](#utilities)
- [Full Examples](#full-examples)

---

## Installation

```bash
pnpm add @kb-labs/shared-command-kit
```

**Dependencies**:
- `@kb-labs/core-platform` - Platform service interfaces
- `@kb-labs/plugin-runtime` - Plugin context and runtime
- `zod` - Schema validation

---

## Quick Start

```typescript
import { defineCommand, useLLM, withSpinner, schemas, validateSchema } from '@kb-labs/shared-command-kit';

export const myCommand = defineCommand({
  name: 'my-plugin:process',
  flags: {
    input: { type: 'string', required: true },
    format: { type: 'string', default: 'json' },
  },
  async handler(ctx, argv, flags) {
    // Use platform services with configuration checks
    const llm = useLLM(ctx);

    // Validation with common schemas
    const config = validateSchema(schemas.jsonString, flags.input);

    // Progress feedback
    const result = await withSpinner(ctx, 'Processing data', async () => {
      return await llm.complete('Analyze this data: ' + config);
    });

    return { ok: true, result: result.content };
  },
});
```

---

## Command Definition

### defineCommand

Define a plugin command with automatic flag validation, analytics, and error handling.

```typescript
import { defineCommand, type CommandResult } from '@kb-labs/shared-command-kit';

type MyResult = CommandResult & {
  processed: number;
  skipped: number;
};

export const processCommand = defineCommand<MyResult>({
  name: 'my-plugin:process',
  flags: {
    scope: { type: 'string', required: true },
    'dry-run': { type: 'boolean', default: false },
    format: { type: 'string', choices: ['json', 'yaml'], default: 'json' },
  },
  analytics: {
    startEvent: 'PROCESS_STARTED',
    finishEvent: 'PROCESS_FINISHED',
    includeFlags: true,
  },
  async handler(ctx, argv, flags) {
    // flags.scope is typed as string
    // flags['dry-run'] is typed as boolean
    // flags.format is typed as 'json' | 'yaml'

    const items = await loadItems(flags.scope);
    const processed = await processItems(items, flags);

    return {
      ok: true,
      processed: processed.length,
      skipped: items.length - processed.length,
    };
  },
});
```

### defineSystemCommand

Define a system command with full privileges (for official KB Labs commands only).

```typescript
import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';

type ListResult = CommandResult & {
  items: Array<{ id: string; name: string }>;
  total: number;
};

export const listCommand = defineSystemCommand<ListResult>({
  name: 'list',
  description: 'List all items',
  category: 'system',
  flags: {
    filter: { type: 'string' },
    json: { type: 'boolean', default: false },
  },
  async handler(ctx, argv, flags) {
    const items = await fetchItems(flags.filter);
    return { ok: true, items, total: items.length };
  },
  formatter(result, ctx, flags) {
    if (flags.json) {
      ctx.output?.json(result);
    } else {
      result.items.forEach(item => ctx.output?.write(`${item.id}: ${item.name}`));
    }
  },
});
```

---

## Manifest Definition

### defineManifest

Define a ManifestV3 for your plugin with type safety and zero runtime dependencies.

```typescript
import { defineManifest } from '@kb-labs/shared-command-kit';

export const manifest = defineManifest({
  schema: 'kb.plugin/3',
  id: '@kb-labs/my-plugin',
  version: '1.0.0',
  commands: [
    {
      name: 'hello',
      handler: './cli/commands/hello.js',
    },
  ],
  permissions: {
    fs: {
      mode: 'read',
      allow: ['.kb/my-plugin/**'],
    },
  },
});

export default manifest;
```

**Why use `defineManifest` instead of plain object?**

- ✅ **Type safety** - TypeScript validates the manifest structure at compile time
- ✅ **Zero runtime dependencies** - Compiles to plain object in dist/ (no imports)
- ✅ **IDE autocomplete** - Get full IntelliSense for all manifest fields
- ✅ **Optional validation** - Can add runtime validation in development if needed

**Note:** `defineManifest` is the V3 API. Legacy `createManifestV2` from `@kb-labs/plugin-manifest` is deprecated.

### defineCommandFlags

Convert flag schema definition (used in `defineCommand`) to manifest format:

```typescript
import { defineManifest, defineCommandFlags } from '@kb-labs/shared-command-kit';

// Define flags once using defineCommand format
const helloFlags = {
  name: { type: 'string', description: 'Name to greet', alias: 'n' },
  json: { type: 'boolean', description: 'Emit JSON', default: false },
  count: { type: 'number', description: 'Repeat count', default: 1 },
} as const;

// Use in manifest
export const manifest = defineManifest({
  cli: {
    commands: [{
      id: 'hello',
      flags: defineCommandFlags(helloFlags), // Converts to manifest format
      handler: './cli/commands/hello#run',
    }],
  },
});

// Use in command handler
import { defineCommand } from '@kb-labs/shared-command-kit';

export const run = defineCommand({
  name: 'hello',
  flags: helloFlags, // Reuse same flag definition
  async handler(ctx, argv, flags) {
    // flags.name is typed as string | undefined
    // flags.json is typed as boolean
    // flags.count is typed as number
    return { ok: true };
  },
});
```

**Benefits:**
- ✅ **DRY** - Define flags once, use in both manifest and command
- ✅ **Type consistency** - Flags in manifest match command handler types
- ✅ **Less boilerplate** - No manual conversion between formats

---

## Permission Presets

**Optional** helpers for defining plugin permissions without boilerplate. You can always use plain objects.

### Permission Combiners

```typescript
import { defineManifest, permissions } from '@kb-labs/shared-command-kit';

export const manifest = defineManifest({
  permissions: permissions.combine(
    // Plugin workspace access (read-write)
    permissions.presets.pluginWorkspace('mind'),

    // LLM API access
    permissions.presets.llmApi(['openai', 'anthropic']),

    // Vector database access
    permissions.presets.vectorDb(['qdrant']),

    // Custom additions
    {
      env: { allow: ['CUSTOM_VAR'] },
    }
  ),
});
```

### Available Presets

```typescript
// Workspace access
permissions.presets.pluginWorkspaceRead('plugin-name')  // Read-only
permissions.presets.pluginWorkspace('plugin-name')      // Read-write

// API access
permissions.presets.llmApi(['openai', 'anthropic', 'google', 'cohere'])
permissions.presets.vectorDb(['qdrant', 'pinecone', 'weaviate'])

// State and analytics
permissions.presets.analytics()

// Development
permissions.presets.monorepo()        // Full monorepo read access
permissions.presets.httpClient()      // Any HTTP host
permissions.presets.localhost()       // Localhost only
```

**Benefits:**
- ✅ **DRY** - Reuse common permission patterns
- ✅ **Security** - Built-in deny patterns for secrets
- ✅ **Composable** - Mix presets with custom permissions
- ✅ **Type-safe** - Full TypeScript support

---

## Error Factory

**Optional** helper for defining plugin errors without boilerplate. You can always use standard Error classes.

### Basic Usage

```typescript
import { defineError } from '@kb-labs/shared-command-kit';

// Define error namespace
export const MindError = defineError('MIND', {
  ValidationFailed: {
    code: 400,
    message: 'Validation failed',
  },
  IndexNotFound: {
    code: 404,
    message: (scope: string) => `Index '${scope}' not found`,
  },
  QueryFailed: {
    code: 500,
    message: 'Query execution failed',
  },
});

// Usage
throw new MindError.IndexNotFound('default');
// Error: "Index 'default' not found" (HTTP 404)

throw new MindError.ValidationFailed({
  details: { field: 'cwd', reason: 'missing' }
});
// Error: "Validation failed" (HTTP 400) with details
```

### Common Error Definitions

```typescript
import { commonErrors } from '@kb-labs/shared-command-kit';

export const MyError = defineError('MY_PLUGIN', {
  ...commonErrors,  // ValidationFailed, NotFound, InternalError, etc.

  CustomError: {
    code: 400,
    message: 'Custom error message',
  },
});
```

### Error Type Guards

```typescript
try {
  throw new MindError.IndexNotFound('default');
} catch (error) {
  if (MindError.is(error)) {
    // error is PluginError from MIND namespace
    console.log(error.statusCode);  // 404
    console.log(error.errorCode);   // "MIND_INDEXNOTFOUND"
  }

  if (MindError.hasCode(error, 'IndexNotFound')) {
    // error is specifically IndexNotFound
    console.log('Index not found!');
  }
}
```

**Benefits:**
- ✅ **Centralized** - All errors defined in one place
- ✅ **Type-safe** - Full TypeScript autocomplete
- ✅ **HTTP codes** - Automatic HTTP status codes
- ✅ **Templates** - Parameterized error messages

---

## Schema Builders

**Optional** helpers for common Zod validation patterns. You can always use plain Zod.

### Basic Usage

```typescript
import { schema } from '@kb-labs/shared-command-kit';
import { z } from 'zod';

const RequestSchema = schema.object({
  // Common KB Labs patterns
  cwd: schema.cwd(),                                    // Optional string
  scope: schema.scopeId(),                              // Non-empty string
  pluginId: schema.pluginId(),                          // @kb-labs/package-name

  // String patterns
  text: schema.text({ min: 1, max: 10000 }),           // Length constraints
  url: schema.url({ optional: true }),                  // URL validation
  email: schema.email(),                                // Email validation

  // Number patterns
  limit: schema.positiveInt({ max: 100, default: 10 }), // Positive integer
  offset: schema.nonNegativeInt({ default: 0 }),        // 0 or positive

  // Enum with default
  mode: schema.enum(['instant', 'auto', 'thinking'], { default: 'auto' }),

  // Boolean with default
  json: schema.boolean({ default: false }),

  // Array with constraints
  tags: schema.array(z.string(), { min: 1, max: 10 }),
});

// Type inference works!
type Request = z.infer<typeof RequestSchema>;
```

### Available Builders

**KB Labs specific:**
- `schema.cwd()` - Current working directory (optional string)
- `schema.scopeId()` - Scope identifier (non-empty string)
- `schema.pluginId()` - Plugin ID (@kb-labs/package-name format)
- `schema.commandId()` - Command ID (plugin:command format)
- `schema.artifactId()` - Artifact ID (plugin.artifact.id format)

**String builders:**
- `schema.text({ min?, max?, default? })` - Text with length constraints
- `schema.filePath({ optional? })` - File path string
- `schema.url({ optional? })` - URL string
- `schema.email({ optional? })` - Email string
- `schema.uuid({ optional? })` - UUID string
- `schema.datetime({ optional? })` - ISO datetime string

**Number builders:**
- `schema.positiveInt({ min?, max?, default? })` - Positive integer
- `schema.nonNegativeInt({ max?, default? })` - Non-negative integer (0+)

**Other builders:**
- `schema.enum(values, { default? })` - Enum with optional default
- `schema.boolean({ default? })` - Boolean with optional default
- `schema.json()` - Any JSON object
- `schema.array(itemSchema, { min?, max? })` - Array with constraints
- `schema.object(shape)` - Alias for z.object

**Benefits:**
- ✅ **DRY** - Common patterns in one place
- ✅ **Readable** - More concise than raw Zod
- ✅ **Type-safe** - Full Zod type inference
- ✅ **Optional** - Mix with plain Zod anytime

---

## REST Handler Definition

**Optional** helper for defining REST handlers with automatic validation and error handling. You can always use plain functions.

### Basic Usage

```typescript
import { defineRestHandler, schema } from '@kb-labs/shared-command-kit';
import { z } from 'zod';

export const handleVerify = defineRestHandler({
  name: 'mind:verify',

  // Automatic Zod validation
  input: z.object({
    cwd: schema.cwd(),
  }),

  // Response schema (for documentation/validation in dev)
  output: z.object({
    ok: z.boolean(),
    cards: z.array(cardDataSchema),
  }),

  // Error definitions with HTTP codes
  errors: {
    'VERIFY_FAILED': { http: 500, message: 'Verification failed' },
  },

  async handler(request, ctx) {
    // request is typed as { cwd?: string }
    // ctx has helpers: log, env, resolveCwd

    // Auto-resolve cwd (from request → env → workspace)
    const cwd = await ctx.resolveCwd(request.cwd);

    const result = await verifyIndexes(cwd);

    // Create widget cards
    const cards = createCardList([
      { title: 'Status', content: result.ok ? 'OK' : 'Issues', status: result.ok ? 'ok' : 'warn' },
      { title: 'Hint', content: result.hint, status: 'info' },
    ]);

    return { ok: true, cards };
  },
});
```

### Enhanced Context Helpers

The handler receives an enhanced context with useful helpers:

```typescript
async handler(request, ctx) {
  // Logger (always available, falls back to console)
  ctx.log('info', 'Processing request', { requestId: ctx.requestId });

  // Environment getter (always available, falls back to process.env)
  const apiKey = ctx.env('OPENAI_API_KEY');

  // Auto-resolve cwd: request.cwd → env KB_LABS_REPO_ROOT → workspace root → '.'
  const cwd = await ctx.resolveCwd(request.cwd);

  // Access runtime services if available
  if (ctx.runtime?.fetch) {
    const response = await ctx.runtime.fetch('https://api.example.com');
  }
}
```

### Error Handling

Automatic error handling with HTTP status codes:

```typescript
export const handler = defineRestHandler({
  name: 'my:handler',
  input: z.object({ id: z.string() }),

  // Define expected errors
  errors: {
    'NOT_FOUND': { http: 404, message: 'Resource not found' },
    'INVALID_STATE': { http: 409, message: 'Invalid state' },
  },

  async handler(request, ctx) {
    // Throw errors with errorCode
    const MyError = defineError('MY', {
      NotFound: { code: 404, message: 'Not found' },
    });

    throw new MyError.NotFound();
    // Automatically mapped to error response with HTTP 404
  },
});
```

### Widget Card Helpers

```typescript
import { createCardList } from '@kb-labs/shared-command-kit';

const cards = createCardList([
  { title: 'Status', content: 'OK', status: 'ok' },
  { title: 'Warning', content: 'Check logs', status: 'warn' },
  { title: 'Error', content: 'Failed to sync', status: 'error' },
  { title: 'Info', content: 'Hint text', status: 'info' },
]);
```

**Benefits:**
- ✅ **Automatic validation** - Input/output validation with Zod
- ✅ **Type safety** - Full TypeScript inference
- ✅ **Error handling** - HTTP codes and structured errors
- ✅ **Context helpers** - log, env, resolveCwd always available
- ✅ **Widget support** - Easy card creation for Studio

---

## Lifecycle Helpers

**Optional** helpers for plugin lifecycle hooks (setup, destroy). You can always use plain functions.

### Setup Handler

```typescript
import { defineSetupHandler } from '@kb-labs/shared-command-kit';

export const setup = defineSetupHandler({
  name: 'mind:setup',

  // Declarative workspace setup
  workspace: {
    // Directories to create
    directories: [
      '.kb/mind/index',
      '.kb/mind/cache',
      '.kb/mind/pack',
    ],
    // Files to create with content
    files: {
      '.kb/mind/.gitignore': 'cache/\npack/\n',
    },
  },

  // Declarative config updates (merged with existing)
  config: {
    'kb.config.json': {
      mind: {
        enabled: true,
        scopes: ['default'],
      },
    },
  },

  // Optional custom logic
  async handler(ctx) {
    ctx.log?.('info', 'Mind workspace initialized', {});
    return { ok: true };
  },
});
```

### Destroy Handler

```typescript
import { defineDestroyHandler } from '@kb-labs/shared-command-kit';

export const destroy = defineDestroyHandler({
  name: 'mind:destroy',

  // Cleanup workspace
  workspace: {
    directories: ['.kb/mind'],
    files: ['.kb/mind/.gitignore'],
  },

  // Cleanup config (remove keys)
  config: {
    'kb.config.json': ['mind'], // Remove 'mind' key
  },

  // Optional custom cleanup
  async handler(ctx) {
    ctx.log?.('info', 'Mind cleanup completed', {});
    return { ok: true };
  },
});
```

### Context Available

```typescript
interface LifecycleContext {
  outdir: string;   // Plugin workspace root
  pluginId: string; // Plugin ID
  requestId?: string;
  log?: (level, msg, meta) => void;
  env?: (key) => string | undefined;
}
```

**Benefits:**
- ✅ **Declarative** - Workspace and config setup in plain objects
- ✅ **Automatic** - Directory creation, config merging handled automatically
- ✅ **Safe** - Merge configs instead of overwrite
- ✅ **Custom logic** - Optional handler for complex setup

---

## Platform Service Helpers

Convenient access to platform services with automatic configuration checks and helpful error messages.

### Service Access

These functions throw `ServiceNotConfiguredError` if the service is not configured (using NoOp/fallback):

```typescript
import { useLLM, useEmbeddings, useVectorStore, useCache, useStorage, useLogger, useAnalytics, useEventBus, useWorkflows, useJobs } from '@kb-labs/shared-command-kit/helpers';

async function handler(ctx: PluginContext) {
  // LLM service (throws if not configured)
  const llm = useLLM(ctx);
  const response = await llm.complete('Hello!');

  // Embeddings service (throws if not configured)
  const embeddings = useEmbeddings(ctx);
  const vector = await embeddings.embed('text to embed');

  // Vector store (throws if not configured)
  const vectorStore = useVectorStore(ctx);
  const results = await vectorStore.search(vector, 10);

  // Always available (safe fallbacks)
  const cache = useCache(ctx);
  const storage = useStorage(ctx);
  const logger = useLogger(ctx);
  const analytics = useAnalytics(ctx);
  const events = useEventBus(ctx);

  // Core features (always available)
  const workflows = useWorkflows(ctx);
  const jobs = useJobs(ctx);
}
```

### Shortcuts

High-level operations that combine service access with common patterns:

```typescript
import { embedText, embedBatch, searchVectors, completeLLM, streamLLM } from '@kb-labs/shared-command-kit/helpers';

async function handler(ctx: PluginContext) {
  // Generate single embedding
  const vector = await embedText(ctx, 'Hello, world!');

  // Generate batch embeddings
  const vectors = await embedBatch(ctx, ['text 1', 'text 2', 'text 3']);

  // Search vectors
  const queryVector = await embedText(ctx, 'search query');
  const results = await searchVectors(ctx, queryVector, 5);

  // LLM completion
  const response = await completeLLM(ctx, 'Explain quantum computing', {
    temperature: 0.7,
    maxTokens: 500,
  });

  // LLM streaming
  for await (const chunk of streamLLM(ctx, 'Write a story')) {
    ctx.ui.message(chunk);
  }
}
```

### Configuration Checking

Check if services are configured without throwing errors:

```typescript
import { isServiceConfigured } from '@kb-labs/shared-command-kit/helpers';

async function handler(ctx: PluginContext) {
  if (isServiceConfigured(ctx, 'llm')) {
    // Use LLM
    const response = await completeLLM(ctx, prompt);
  } else {
    // Fallback behavior
    ctx.ui.warning('LLM not configured, using fallback');
  }
}
```

---

## Validation Helpers

Ready-to-use validation schemas and Zod integration for type-safe input validation.

### Common Schemas

```typescript
import { schemas } from '@kb-labs/shared-command-kit/helpers';

const userSchema = z.object({
  name: schemas.nonEmptyString,
  email: schemas.email,
  version: schemas.semver,
  repo: schemas.githubUrl,
  age: schemas.positiveInt,
  port: schemas.port,
  id: schemas.uuid,
  tenantId: schemas.tenantId,
  pluginId: schemas.pluginId,
  packageName: schemas.packageName,
  config: schemas.jsonString,
  color: schemas.hexColor,
  url: schemas.url,
  createdAt: schemas.isoDate,
});
```

**Available schemas**:
- `packageName` - NPM package name (scoped or unscoped)
- `scopedPackageName` - Scoped package name (must start with @)
- `semver` - Semantic version
- `email` - Email address
- `url` - HTTP/HTTPS URL
- `githubUrl` - GitHub repository URL
- `filePath` - File path (Unix-style)
- `nonEmptyString` - Non-empty string (trimmed)
- `positiveInt` - Positive integer
- `nonNegativeInt` - Non-negative integer (including 0)
- `port` - Port number (1-65535)
- `uuid` - UUID v4
- `isoDate` - ISO 8601 date string
- `jsonString` - JSON string (can be parsed)
- `hexColor` - Hexadecimal color code
- `tenantId` - Tenant ID (alphanumeric, dash, underscore)
- `pluginId` - Plugin ID (scoped package name)

### Validation Functions

```typescript
import { validateInput, safeValidate, validateSchema, validateArray } from '@kb-labs/shared-command-kit/helpers';
import { z } from 'zod';

// Validate input (throws ValidationError on failure)
const configSchema = z.object({
  output: z.string().optional(),
  force: z.boolean().default(false),
});

const config = validateInput(configSchema, rawInput);
// config is typed as { output?: string; force: boolean }

// Safe validation (returns success/failure)
const result = safeValidate(schemas.email, input);
if (result.success) {
  console.log('Valid email:', result.data);
} else {
  console.error('Invalid:', result.error);
  console.error('Issues:', result.issues);
}

// Validate schema (convenience wrapper)
const validConfig = validateSchema(configSchema, rawConfig);

// Validate array of items
const { valid, invalid } = validateArray(schemas.email, emails);
console.log(`${valid.length} valid, ${invalid.length} invalid`);
for (const { index, error } of invalid) {
  console.error(`Item ${index}: ${error}`);
}
```

### Type Guards

```typescript
import { isPackageName, isSemver, isEmail, isUrl, isUUID } from '@kb-labs/shared-command-kit/helpers';

if (isPackageName(value)) {
  // value is typed as string
  installPackage(value);
}

if (isSemver(version)) {
  compareVersions(version, '1.0.0');
}

if (isEmail(contact)) {
  sendEmail(contact);
}
```

### Helper Functions

```typescript
import { optionalString, optionalBoolean, optionalNumber, enumFromArray } from '@kb-labs/shared-command-kit/helpers';

const schema = z.object({
  format: optionalString('json'),        // defaults to 'json'
  force: optionalBoolean(false),         // defaults to false
  timeout: optionalNumber(5000),         // defaults to 5000
  mode: enumFromArray(['instant', 'auto', 'thinking'] as const),
});
```

---

## Common Patterns

### Spinner Pattern

Show progress feedback for long-running operations:

```typescript
import { withSpinner, withSteps } from '@kb-labs/shared-command-kit/helpers';

// Single operation with spinner
const result = await withSpinner(
  ctx,
  'Indexing documents',
  async () => {
    return await indexDocuments(docs);
  }
);
// Output: "Indexing documents... ✓"

// Multiple steps with progress
const [docs, vectors, stored] = await withSteps(ctx, [
  { message: 'Loading documents', fn: () => loadDocuments() },
  { message: 'Generating embeddings', fn: () => generateEmbeddings(docs) },
  { message: 'Storing in database', fn: () => storeVectors(vectors) },
]);
// Output:
// "Loading documents... ✓"
// "Generating embeddings... ✓"
// "Storing in database... ✓"
```

### Batch Processing

Process arrays with concurrency control and progress feedback:

```typescript
import { processBatch, processBatchWithUI } from '@kb-labs/shared-command-kit/helpers';

// Batch processing with custom options
const results = await processBatch(
  files,
  async (file, index) => await processFile(file),
  {
    concurrency: 10,
    onProgress: (completed, total) => {
      ctx.ui.message(`Processed ${completed}/${total}`);
    },
    onError: (error, item) => {
      ctx.ui.warning(`Failed to process ${item}: ${error.message}`);
    },
    stopOnError: false,
  }
);

// Batch processing with automatic UI updates
const results = await processBatchWithUI(
  ctx,
  files,
  async (file) => await processFile(file),
  { concurrency: 10 }
);
// Automatically shows: "Processing 1/100... 2/100..."
```

### Retry Logic

Retry operations with exponential backoff:

```typescript
import { retryWithBackoff, retryWithUI } from '@kb-labs/shared-command-kit/helpers';

// Retry with custom options
const data = await retryWithBackoff(
  async () => await fetchFromAPI(),
  {
    maxRetries: 5,
    delay: 1000,
    backoff: 2,
    maxDelay: 30000,
    onRetry: (attempt, error) => {
      console.log(`Retry ${attempt}: ${error.message}`);
    },
    shouldRetry: (error) => {
      // Only retry on network errors
      return error.message.includes('ECONNREFUSED');
    },
  }
);

// Retry with UI feedback
const data = await retryWithUI(
  ctx,
  'Fetching data from API',
  async () => await api.getData(),
  { maxRetries: 3 }
);
// Output: "Retrying (1/3)...", "Retrying (2/3)..."
```

### Utilities

```typescript
import { sleep, withTimeout, debounce, throttle } from '@kb-labs/shared-command-kit/helpers';

// Sleep
await sleep(1000); // Wait 1 second

// Timeout wrapper
const result = await withTimeout(
  async () => await slowOperation(),
  5000 // 5 seconds timeout
);

// Debounce (wait for calls to stop)
const debouncedSave = debounce(
  async (data) => await saveToDatabase(data),
  1000
);
debouncedSave(data1);
debouncedSave(data2);
debouncedSave(data3); // Only this one executes

// Throttle (execute at most once per interval)
const throttledLog = throttle(
  async (message) => await sendToAPI(message),
  5000
);
throttledLog('msg1'); // Executes immediately
throttledLog('msg2'); // Ignored (within 5s)
// ... 5s later ...
throttledLog('msg3'); // Executes
```

---

## Related Packages

- `@kb-labs/core-platform` - Platform service interfaces
- `@kb-labs/core-runtime` - DI container and core implementations
- `@kb-labs/plugin-runtime` - Plugin context and runtime
- `@kb-labs/shared-cli-ui` - CLI UI components and formatters

---

## License

MIT

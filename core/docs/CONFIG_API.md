# Configuration API Reference

Complete API documentation for `@kb-labs/core-bundle` and related packages.

## Core API: loadBundle()

Single entry point for loading complete bundle with config, profile, artifacts, and policy.

### Signature

```typescript
function loadBundle(opts: LoadBundleOptions): Promise<Bundle>

interface LoadBundleOptions {
  cwd?: string;
  product: ProductId;
  profileKey?: string;        // Default: 'default'
  cli?: Record<string, any>;   // Optional CLI overrides
  writeFinalConfig?: boolean;  // Optional: write merged config
  validate?: boolean | 'warn'; // Optional: validate product config (CLI uses --no-fail for warn)
}
```

### Usage

```typescript
import { loadBundle } from '@kb-labs/core-bundle';

const bundle = await loadBundle({
  product: 'aiReview',
  profileKey: 'default',
  cli: { debug: true }
});

// Access configuration (merged from 6 layers)
const config = bundle.config as AiReviewConfig;

// Access artifacts
const rules = await bundle.artifacts.list('rules');
const prompts = await bundle.artifacts.list('prompts');

// Check permissions
if (!bundle.policy.permits('aiReview.run')) {
  throw new Error('Permission denied');
}

// Debug with trace
for (const step of bundle.trace) {
  console.log(`${step.layer}: ${step.source}`);
}
```

When `cwd` is omitted, `loadBundle` resolves the workspace root automatically by consulting `KB_LABS_WORKSPACE_ROOT`/`KB_LABS_REPO_ROOT` or the nearest `.kb/kb-labs.config.json` ancestor. Provide `cwd` explicitly to override this behaviour (e.g., for multi-workspace testing).

## Bundle Interface

```typescript
interface Bundle {
  product: ProductId;           // Product identifier
  config: unknown;              // Merged configuration
  profile: {
    key: string;               // Profile key (e.g., 'default')
    name: string;              // Profile name (e.g., 'node-ts-lib')
    version: string;           // Profile version (e.g., '1.2.0')
    overlays?: string[];       // Profile overlays
  };
  artifacts: {
    summary: Record<string, string[]>;  // Available artifacts by key
    list(key: string): Promise<Array<{ relPath: string; sha256: string }>>;
    materialize(keys?: string[]): Promise<{
      filesCopied: number;
      filesSkipped: number;
      bytesWritten: number;
    }>;
  };
  policy: {
    bundle?: string;            // Policy bundle name
    permits: (action: string, resource?: any) => boolean;
  };
  trace: MergeTrace[];         // Configuration resolution trace
}
```

## Configuration Layers

Configuration is merged from 6 layers in order of precedence (later layers override earlier ones):

### 1. Runtime Defaults

Built-in defaults for each product, defined in `getRuntimeDefaults()`.

```typescript
// Example for aiReview
{
  enabled: true,
  rules: [],
  maxFiles: 100
}
```

### 2. Profile Defaults

Product-specific defaults from profile manifest.

**Profile manifest:**
```json
{
  "defaults": {
    "ai-review": {
      "$ref": "./defaults/ai-review.json"
    }
  }
}
```

**Default file:** `.kb/profiles/node-ts-lib/defaults/ai-review.json`
```json
{
  "rules": ["security", "performance"],
  "maxFiles": 50
}
```

### 3. Preset Defaults

Organization-wide defaults from preset package.

**Workspace config:**
```yaml
$extends: "@kb-labs/org-preset@^1.0.0"
```

### 4. Workspace Config

Project-level configuration from `kb-labs.config.yaml`.

```yaml
products:
  ai-review:
    enabled: true
    maxFiles: 25
```

### 5. Local Config

User-specific overrides from `.kb/ai-review/ai-review.config.json`.

```json
{
  "debug": true,
  "maxFiles": 10
}
```

### 6. CLI Overrides

Command-line arguments.

```typescript
const bundle = await loadBundle({
  cwd: process.cwd(),
  product: 'aiReview',
  cli: { debug: false, maxFiles: 5 }
});
```

## Artifacts API

### list()

List artifacts for a specific key.

```typescript
const rules = await bundle.artifacts.list('rules');
// Returns: [
//   { relPath: 'rules.yml', sha256: 'abc123...' },
//   { relPath: 'rules/security.yml', sha256: 'def456...' }
// ]
```

### materialize()

Materialize artifacts to local cache at `.kb/<product>/`.

```typescript
const result = await bundle.artifacts.materialize(['rules', 'prompts']);
// Returns: {
//   filesCopied: 10,
//   filesSkipped: 2,
//   bytesWritten: 102400
// }
```

### security

- Only whitelisted file types allowed (`.yml`, `.yaml`, `.md`, `.txt`, `.json`)
- File size limit: 1MB per file
- Max files per key: 100
- SHA256 verification for all artifacts

## Policy API

### permits()

Check if an action is permitted.

```typescript
// Check action
if (!bundle.policy.permits('aiReview.run')) {
  throw new Error('Permission denied');
}

// Check resource-specific permission
if (!bundle.policy.permits('profiles.materialize', 'ai-review')) {
  throw new Error('Cannot materialize ai-review profile');
}
```

### Base Actions

```typescript
type BaseActions = {
  aiReview: 'aiReview.run';
  release: 'release.publish';
  devkit: 'devkit.sync';
  devlink: 'devlink.watch';
  profiles: 'profiles.materialize';
};
```

## Trace API

Configuration resolution trace for debugging.

```typescript
for (const step of bundle.trace) {
  console.log(`${step.layer}: ${step.source}`);
}

// Example output:
// runtime: runtime:defaults
// profile: profile:node-ts-lib@1.2.0
// preset: preset:none
// workspace: workspace:kb-labs.config
// local: local:.kb/ai-review/ai-review.config.json
// cli: cli:overrides
```

```typescript
interface MergeTrace {
  path: string;              // Configuration path (e.g., 'maxFiles')
  source: string;            // Source layer
  type: 'set' | 'overwriteArray';
  layer: string;            // Layer name
  profileKey?: string;
  profileRef?: string;
  presetRef?: string;
  version?: string;
}
```

## Product Configuration

### Getting Config

```typescript
// Direct access
const config = bundle.config as AiReviewConfig;

// Specific fields
const maxFiles = bundle.config.maxFiles;
const debug = bundle.config.debug;
```

### Type Safety

Define TypeScript types for your product config:

```typescript
interface AiReviewConfig {
  enabled: boolean;
  rules: string[];
  maxFiles: number;
  debug?: boolean;
  // ... other fields
}

const config = bundle.config as AiReviewConfig;
```

## Error Handling

### Error Codes

```typescript
enum ConfigErrorCodes {
  ERR_CONFIG_NOT_FOUND = 'ERR_CONFIG_NOT_FOUND',
  ERR_PROFILE_NOT_DEFINED = 'ERR_PROFILE_NOT_DEFINED',
  ERR_PROFILE_RESOLVE_FAILED = 'ERR_PROFILE_RESOLVE_FAILED',
  ERR_FORBIDDEN = 'ERR_FORBIDDEN',
  ERR_DEFAULTS_READ_FAILED = 'ERR_DEFAULTS_READ_FAILED'
}
```

### Error Example

```typescript
try {
  const bundle = await loadBundle({ product: 'aiReview' });
} catch (error) {
  if (error instanceof KbError) {
    console.error(`Error: ${error.message}`);
    console.error(`Hint: ${error.hint}`);
    console.error(`Code: ${error.code}`);
    process.exit(getExitCode(error));
  }
}
```

## Caching

### clearCaches()

Clear all caches (useful for tests).

```typescript
import { clearCaches } from '@kb-labs/core-bundle';

beforeEach(() => {
  clearCaches();
});
```

Caches include:
- File system read cache (LRU)
- Artifact metadata cache
- Configuration resolution cache

## Utility Functions

### Product Normalization

```typescript
import { toFsProduct, toConfigProduct } from '@kb-labs/core-config';

// Convert to filesystem format
toFsProduct('aiReview');  // 'ai-review'

// Convert to code format
toConfigProduct('ai-review');  // 'aiReview'
```

### Path Helpers

```typescript
import {
  getProfilesRootDir,
  getProductConfigDir,
  getProductConfigPath,
  getKbRootDir,
  getLockfilePath
} from '@kb-labs/core-config';

const profilesDir = getProfilesRootDir(cwd);  // '.kb/profiles'
const configDir = getProductConfigDir(cwd, 'ai-review');  // '.kb/ai-review'
const configPath = getProductConfigPath(cwd, 'ai-review');  // '.kb/ai-review/ai-review.config.json'
const kbDir = getKbRootDir(cwd);  // '.kb'
const lockPath = getLockfilePath(cwd);  // '.kb/lock.json'
```

## TypeScript Types

### ProductId

```typescript
type ProductId = 
  | 'devlink' 
  | 'release' 
  | 'aiReview' 
  | 'aiDocs' 
  | 'devkit';
```

### LoadBundleOptions

```typescript
interface LoadBundleOptions {
  cwd?: string;
  product: ProductId;
  profileKey?: string;
  cli?: Record<string, unknown>;
  writeFinalConfig?: boolean;
}
```

### MergeTrace

```typescript
interface MergeTrace {
  path: string;
  source: string;
  type: 'set' | 'overwriteArray';
  layer: string;
  profileKey?: string;
  profileRef?: string;
  presetRef?: string;
  version?: string;
}
```

## Complete Example

```typescript
import { loadBundle, KbError, getExitCode } from '@kb-labs/core-bundle';

async function runProduct() {
  try {
    // Load bundle
    const bundle = await loadBundle({
      product: 'aiReview',
      profileKey: 'default',
      cli: { debug: false }
    });
    
    // Get config
    const config = bundle.config as AiReviewConfig;
    
    // Check permissions
    if (!bundle.policy.permits('aiReview.run')) {
      throw new Error('Permission denied');
    }
    
    // Load artifacts
    const rules = await bundle.artifacts.list('rules');
    
    // Materialize if needed
    await bundle.artifacts.materialize(['rules', 'prompts']);
    
    // Run product with config
    await runAIReview(config, rules);
    
  } catch (error) {
    if (error instanceof KbError) {
      console.error(`Error: ${error.message}`);
      console.error(`Hint: ${error.hint}`);
      process.exit(getExitCode(error));
    }
    throw error;
  }
}
```

## See Also

- [MIGRATION_GUIDE.md](../MIGRATION_GUIDE.md) - Step-by-step migration guide
- [ADDING_PRODUCT.md](./ADDING_PRODUCT.md) - How to add a new product
- [BUNDLE_OVERVIEW.md](./BUNDLE_OVERVIEW.md) - System architecture overview


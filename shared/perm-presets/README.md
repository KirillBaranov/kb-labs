# @kb-labs/perm-presets

> Composable permission presets for KB Labs plugin manifests.

## Installation

```bash
pnpm add @kb-labs/perm-presets
```

Or use via `@kb-labs/sdk` (already bundled):

```typescript
import { minimalPreset, combinePermissions } from '@kb-labs/sdk';
```

## Quick Start

```typescript
import { combine, minimal, llmAccess, gitWorkflow } from '@kb-labs/perm-presets';
import { defineManifest } from '@kb-labs/sdk';

export default defineManifest({
  schema: 'kb.plugin/3',
  id: 'my-plugin',
  version: '1.0.0',
  permissions: combine(minimal, llmAccess, gitWorkflow),
});
```

## Available Presets

| Preset | Description |
|--------|-------------|
| `minimal` | Minimal permissions (read-only workspace) |
| `gitWorkflow` | Git read/write operations |
| `npmPublish` | npm publish permissions |
| `fullEnv` | Full environment variable access |
| `kbPlatform` | KB Labs platform API access |
| `llmAccess` | LLM API access |
| `vectorStore` | Vector store access |
| `ciEnvironment` | CI/CD environment permissions |

## API

### `combine(...presets)`

Merge multiple presets into a single `PermissionSpec`:

```typescript
import { combine, minimal, llmAccess } from '@kb-labs/perm-presets';

const permissions = combine(minimal, llmAccess);
```

### `combinePresets(presets[])`

Same as `combine` but accepts an array:

```typescript
import { combinePresets, presets } from '@kb-labs/perm-presets';

const permissions = combinePresets([presets.minimal, presets.llmAccess]);
```

### `presets` namespace

All presets accessible as a namespace:

```typescript
import { presets, combine } from '@kb-labs/perm-presets';

const permissions = combine(presets.minimal, presets.kbPlatform);
```

## License

MIT

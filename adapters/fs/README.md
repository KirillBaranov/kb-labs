# @kb-labs/adapters-fs

> Part of [KB Labs](https://github.com/KirillBaranov/kb-labs) ecosystem. Works exclusively within KB Labs platform.

Filesystem storage adapter for local file operations with path security and glob pattern support.

## Overview

| Property | Value |
|----------|-------|
| **Implements** | `IStorage` |
| **Type** | `core` |
| **Requires** | None |
| **Category** | Storage |

## Features

- **Path Security** - Sandboxed file access within configured base directory
- **Streaming Support** - Efficient large file handling with streams
- **Glob Patterns** - Find files using glob patterns
- **Metadata Access** - Get file stats, size, modification time

## Installation

```bash
pnpm add @kb-labs/adapters-fs
```

## Configuration

Add to your `kb.config.json`:

```json
{
  "platform": {
    "adapters": {
      "storage": "@kb-labs/adapters-fs"
    },
    "adapterOptions": {
      "storage": {
        "baseDir": ".kb/data"
      }
    }
  }
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseDir` | `string` | `process.cwd()` | Base directory for all file operations |

## Usage

### Via Platform (Recommended)

```typescript
import { usePlatform } from '@kb-labs/sdk';

const platform = usePlatform();

// Read file
const content = await platform.storage.read('config.json');

// Write file
await platform.storage.write('output.txt', 'Hello, World!');

// List files with glob
const files = await platform.storage.glob('**/*.ts');
```

### Standalone (Testing/Development)

```typescript
import { createAdapter } from '@kb-labs/adapters-fs';

const storage = createAdapter({ baseDir: '/path/to/data' });

await storage.write('test.txt', 'content');
const content = await storage.read('test.txt');
```

## How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│  FS Adapter │────▶│ File System │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                    Path Validation
                    (stays in baseDir)
```

The adapter validates all paths to ensure they stay within the configured `baseDir`, preventing path traversal attacks (e.g., `../../../etc/passwd`).

## Adapter Manifest

```typescript
{
  id: 'fs-storage',
  name: 'Filesystem Storage',
  version: '1.0.0',
  implements: 'IStorage',
  capabilities: {
    streaming: true,
    custom: {
      glob: true,
      metadata: true,
    },
  },
}
```

## Performance Considerations

- **Memory**: Uses streams for large files to avoid memory issues
- **Latency**: Depends on disk I/O, SSD recommended for production
- **Throughput**: Limited by disk speed and OS file system cache

## FAQ

<details>
<summary><strong>Q: Can I use this adapter outside KB Labs platform?</strong></summary>

No. This adapter is designed specifically for KB Labs ecosystem and depends on platform interfaces and contracts. Use `createAdapter()` for standalone testing only.
</details>

<details>
<summary><strong>Q: How do I prevent path traversal attacks?</strong></summary>

The adapter automatically validates all paths. Any attempt to access files outside `baseDir` will throw an error. You don't need to do anything extra.
</details>

<details>
<summary><strong>Q: Can I use absolute paths?</strong></summary>

No. All paths are relative to `baseDir`. This is by design for security.
</details>

## Related Adapters

| Adapter | Use Case |
|---------|----------|
| `@kb-labs/adapters-analytics-file` | File-based analytics storage |

## Troubleshooting

### Error: EACCES permission denied

**Cause**: The process doesn't have write permissions to the target directory.

**Solution**: Check directory permissions or choose a different `baseDir`:

```bash
chmod 755 /path/to/your/baseDir
```

### Error: Path outside base directory

**Cause**: Attempted to access a file outside the sandboxed `baseDir`.

**Solution**: Use relative paths only. Don't use `..` to escape the directory.

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## License

[KB Public License v1.1](../../LICENSE) - KB Labs Team

# Cookbook: Port Legacy Commands to Plugins

> **Note**
> This cookbook focuses on legacy `CommandManifest` files. When creating new plugins use ManifestV2 (`kb.plugin/2`) and adapt the steps accordingly. The CLI registry automatically converts ManifestV2 CLI declarations into the internal format described below.

This guide shows how to convert an existing CLI command into a KB CLI plugin in 5 simple steps.

## Before You Start

Make sure you have:
- An existing command implementation
- Access to the command's source code
- Understanding of the command's dependencies

## Step 1: Create Plugin Package Structure

```bash
# Create new package directory
mkdir -p packages/my-plugin-cli/src/{kb,commands}
cd packages/my-plugin-cli
```

Create `package.json`:
```json
{
  "name": "@kb-labs/my-plugin-cli",
  "version": "1.0.0",
  "type": "module",
  "keywords": ["kb-cli-plugin"],
  "exports": {
    "./kb/commands": "./dist/kb/commands.js"
  },
  "kb": {
    "plugin": true
  },
  "scripts": {
    "build": "tsup src/kb/commands.ts --format esm --dts"
  }
}
```

## Step 2: Create Manifest File

Create `src/kb/commands.ts`:

```typescript
import type { CommandManifest } from '@kb-labs/cli-commands';

export const commands: CommandManifest[] = [
  {
    manifestVersion: '1.0',
    id: 'my-plugin:command-name',  // namespace:command format
    group: 'my-plugin',            // namespace
    namespace: 'my-plugin',
    package: '@kb-labs/my-plugin-cli',
    describe: 'Description of your command',
    longDescription: 'Detailed description if needed',
    
    // Copy flags from original command
    flags: [
      {
        name: 'verbose',
        type: 'boolean',
        alias: 'v',
        description: 'Verbose output',
      },
      // ... other flags
    ],
    
    // Copy examples from original command
    examples: [
      'kb my-plugin command-name --verbose',
    ],
    
    // Point to command implementation
    loader: async () => import('../commands/command-name.js'),
  },
];
```

## Step 3: Move Command Implementation

Copy your command implementation to `src/commands/command-name.ts`:

```typescript
import type { CommandModule } from '@kb-labs/cli-commands';

export const run: CommandModule['run'] = async (ctx, argv, flags) => {
  // Your existing command logic here
  // ctx, argv, flags are the same as before
  
  ctx.presenter.info('Hello from plugin!');
  return 0;
};
```

## Step 4: Update Dependencies

Add required dependencies to `package.json`:

```json
{
  "dependencies": {
    "@kb-labs/cli-commands": "workspace:*",
    // ... your other dependencies
  },
  "devDependencies": {
    "tsup": "^8.5.0",
    "typescript": "^5.6.3"
  }
}
```

## Step 5: Build and Test

```bash
# Build the plugin
pnpm build

# Link for local testing
kb plugins link ./packages/my-plugin-cli

# Test the command
kb my-plugin command-name --verbose

# Verify it's discovered
kb plugins ls
```

## Migration Checklist

- [ ] Manifest file created with correct ID format (`namespace:command`)
- [ ] Command implementation moved to `commands/` directory
- [ ] Flags copied from original command
- [ ] Examples updated with new namespace
- [ ] Dependencies added to `package.json`
- [ ] Plugin builds successfully
- [ ] Command discovered via `kb plugins ls`
- [ ] Command executes correctly
- [ ] Help works (`kb my-plugin command-name --help`)

## Common Issues

### Issue: Command not discovered

**Solution**: Check that:
- `keywords: ["kb-cli-plugin"]` is in package.json
- `exports["./kb/commands"]` points to correct path
- Manifest file exports `commands` array

### Issue: Command execution fails

**Solution**: 
- Check imports in command implementation
- Verify dependencies are installed
- Run `kb plugins doctor` for diagnostics

### Issue: Flags not working

**Solution**:
- Ensure flag types match (`boolean`, `string`, `number`, `array`)
- Check flag names match exactly (case-sensitive)
- Verify aliases are single letters

## Advanced: Multiple Commands

To port multiple commands:

```typescript
export const commands: CommandManifest[] = [
  {
    manifestVersion: '1.0',
    id: 'my-plugin:command1',
    group: 'my-plugin',
    loader: async () => import('../commands/command1.js'),
    // ...
  },
  {
    manifestVersion: '1.0',
    id: 'my-plugin:command2',
    group: 'my-plugin',
    loader: async () => import('../commands/command2.js'),
    // ...
  },
];
```

## Next Steps

1. **Publish**: `pnpm publish` (when ready)
2. **Document**: Add README with usage examples
3. **Test**: Write tests for command logic
4. **Share**: Add to plugin registry (when available)

## Example: Complete Migration

**Before** (built-in command):
```typescript
// packages/commands/src/commands/my-command.ts
export const myCommand: Command = {
  name: "my-command",
  describe: "My command",
  flags: [{ name: "verbose", type: "boolean" }],
  async run(ctx, argv, flags) { /* ... */ }
};
```

**After** (plugin):
```typescript
// packages/my-plugin-cli/src/kb/commands.ts
export const commands: CommandManifest[] = [{
  manifestVersion: '1.0',
  id: 'my-plugin:command',
  group: 'my-plugin',
  describe: 'My command',
  flags: [{ name: "verbose", type: "boolean" }],
  loader: async () => import('../commands/command.js'),
}];
```

That's it! Your command is now a plugin.


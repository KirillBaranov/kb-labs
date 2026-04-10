# @kb-labs/core-cli

CLI commands for KB Labs core configuration system.

## Available Commands

### init group

#### `kb init setup`
Initialize complete KB Labs workspace with config, profile, and policy.

```bash
kb init setup
kb init setup --yes                    # Skip prompts
kb init setup --products aiReview,devlink
kb init setup --dry-run                # Preview changes
```

**Options:**
- `--format (yaml|json)` - Config format (default: yaml)
- `--products` - Comma-separated product list
- `--profile-key` - Profile key (default: default)
- `--profile-ref` - Profile reference
- `--preset-ref` - Org preset reference
- `--policy-bundle` - Policy bundle name
- `--dry-run` - Preview without making changes
- `--force` - Overwrite existing files
- `--yes` - Skip confirmation prompts

#### `kb init workspace`
Initialize workspace configuration file.

```bash
kb init workspace
kb init workspace --format json --force
```

#### `kb init policy`
Initialize policy configuration.

```bash
kb init policy
kb init policy --bundle-name default
```

### config group

#### `kb config get`
Get product configuration.

```bash
kb config get --product aiReview
kb config get --product aiReview --json
kb config get --product aiReview --yaml
kb config get --product devlink --profile-key production
```

**Options:**
- `--product` - Product ID (required)
- `--profile-key` - Profile key (default: default)
- `--json` - Output as JSON
- `--yaml` - Output as YAML

#### `kb config explain`
Explain how configuration is resolved from all layers.

```bash
kb config explain --product aiReview
kb config explain --product aiReview --json
```

**Options:**
- `--product` - Product ID (required)
- `--profile-key` - Profile key (default: default)
- `--json` - Output as JSON

#### `kb config inspect`
Inspect product configuration (summary + validation).

```bash
kb config inspect --product aiReview
kb config inspect --product devlink --json
```

**Options:**
- `--product` - Product ID (required)
- `--profile-key` - Profile key (default: default)
- `--json` - Output as JSON

#### `kb config validate`
Validate merged configuration against JSON Schemas.

```bash
kb config validate --product aiReview
kb config validate --product devlink --no-fail --json
```

**Options:**
- `--product` - Product ID (required)
- `--profile-key` - Profile key (default: default)
- `--no-fail` - Warn instead of failing
- `--json` - Output as JSON

#### `kb config doctor` (aliases: `kb doctor`)
Check configuration health and get suggestions.

```bash
kb config doctor
kb config doctor --json
kb config doctor --fix              # Auto-fix issues
```

**Options:**
- `--json` - Output as JSON
- `--fix` - Auto-fix issues

### bundle group

#### `kb bundle print`
Print complete bundle for a product.

```bash
kb bundle print --product aiReview
kb bundle print --product devlink --with-trace
```

**Options:**
- `--product` - Product ID (required)
- `--profile-key` - Profile key (default: default)
- `--json` - Output as JSON
- `--with-trace` - Include configuration trace

#### `kb bundle inspect`
Inspect bundle (profile + config + artifacts + trace).

```bash
kb bundle inspect --product aiReview
kb bundle inspect --product aiReview --trace --json
```

**Options:**
- `--product` - Product ID (required)
- `--profile-key` - Profile key (default: default)
- `--trace` - Include compact trace
- `--json` - Output as JSON

### profiles group

#### `kb profiles resolve`
Resolve and display profile configuration.

```bash
kb profiles resolve
kb profiles resolve --profile-key production --json
```

**Options:**
- `--profile-key` - Profile key (default: default)
- `--json` - Output as JSON

#### `kb profiles validate`
Validate profile manifest (v1.0).

```bash
kb profiles validate
kb profiles validate --profile-key production --json
```

**Options:**
- `--profile-key` - Profile key (default: default)
- `--json` - Output as JSON

#### `kb profiles inspect`
Inspect profile manifest (summary).

```bash
kb profiles inspect
kb profiles inspect --profile-key production --json
```

**Options:**
- `--profile-key` - Profile key (default: default)
- `--json` - Output as JSON

## Examples

### Setup new workspace

```bash
# Complete setup
kb init setup --products aiReview,devlink --yes

# Check configuration
kb config doctor

# Get product config
kb config get --product aiReview
```

### Debug configuration

```bash
# Explain how config is resolved
kb config explain --product aiReview

# Print complete bundle with trace
kb bundle print --product aiReview --with-trace
```

### Troubleshooting

```bash
# Check health and get suggestions
kb config doctor

# If issues found, follow suggestions
kb init workspace
kb init setup --yes
```

## Integration with CLI suggestions

The CLI provides helpful suggestions when issues are detected:

```bash
$ kb config get --product aiReview
Error: Workspace config not found

Suggestions:
  kb init workspace - Initialize workspace configuration
  kb init setup --yes - Run complete setup
```

## For Developers

### Adding New Commands

1. Add command definition to `src/cli.manifest.ts`
2. Create command implementation in `src/cli/<group>/<command>.ts`
3. Export run function with `CommandModule['run']` type
4. Rebuild: `pnpm build`

### Testing

```bash
pnpm test
pnpm test:watch
```

### Building

```bash
pnpm build
```


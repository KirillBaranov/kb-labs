# @kb-labs/core-cli

Command-line interface for kb-labs-core configuration system.

## Installation

```bash
npm install @kb-labs/core-cli
```

## Usage

### Configuration Validation

Validate product configuration:

```bash
kb config validate --product aiReview
kb config validate --product devlink --profile production
```

### Options

- `--product`: Product ID to validate (required)
- `--profile`: Profile key to use (optional)
- `--cwd`: Working directory (optional, defaults to current directory)

## Examples

```bash
# Validate AI Review config
kb config validate --product aiReview

# Validate DevLink config with profile
kb config validate --product devlink --profile development

# Validate in specific directory
kb config validate --product aiReview --cwd /path/to/project
```

## Error Handling

The CLI provides clear error messages for validation failures:

```
❌ Config validation failed:
Config validation failed for product aiReview
```

## Integration

The CLI integrates with the kb-labs-core configuration system:

- Uses `@kb-labs/bundle` for configuration loading
- Uses `@kb-labs/config` for validation
- Uses `@kb-labs/profiles` for profile support
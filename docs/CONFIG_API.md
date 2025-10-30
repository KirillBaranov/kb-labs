# Configuration API

## Overview

The kb-labs-core configuration system provides a unified way to load and validate product configurations with profile support.

## Core Packages

- **@kb-labs/bundle** - Main configuration loading API
- **@kb-labs/config** - Product configuration validation
- **@kb-labs/profiles** - Profile validation and management
- **@kb-labs/core-cli** - Command-line interface

## Configuration Loading

### loadBundle()

Load and validate product configuration with optional profile support.

```typescript
import { loadBundle } from '@kb-labs/bundle';

const result = await loadBundle({
  cwd: process.cwd(),
  product: 'aiReview',
  profileKey: 'default',
  cli: { enabled: true },
  validate: true
});
```

### Options

- **cwd**: Working directory for config resolution
- **product**: Product ID (aiReview, devlink, etc.)
- **profileKey**: Optional profile to apply
- **cli**: CLI overrides to merge
- **validate**: Enable validation (true, false, or 'warn')

## Validation

### Product Config Validation

```typescript
import { validateProductConfig } from '@kb-labs/config';

const result = validateProductConfig('aiReview', config);
if (!result.ok) {
  console.error('Validation errors:', result.errors);
}
```

### Profile Validation

```typescript
import { validateProfile } from '@kb-labs/profiles';

const result = validateProfile(profile);
if (!result.ok) {
  console.error('Profile validation errors:', result.errors);
}
```

## CLI Usage

### Validate Configuration

```bash
kb config validate --product aiReview
kb config validate --product devlink --profile default
```

## Error Handling

The system provides structured error handling:

```typescript
try {
  await loadBundle({ cwd, product, validate: true });
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.error('Config validation failed:', error.errors);
  }
}
```
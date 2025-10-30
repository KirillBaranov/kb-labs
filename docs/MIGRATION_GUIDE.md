# Migration Guide

## Overview

This guide helps you migrate from individual product configuration systems to the unified kb-labs-core configuration system.

## Migration Steps

### 1. Install Dependencies

```bash
npm install @kb-labs/bundle @kb-labs/config @kb-labs/profiles @kb-labs/core-cli
```

### 2. Update Configuration Loading

**Before:**
```typescript
// Old way - product-specific loading
import { loadAiReviewConfig } from './ai-review-config';
const config = loadAiReviewConfig();
```

**After:**
```typescript
// New way - unified loading
import { loadBundle } from '@kb-labs/bundle';
const result = await loadBundle({
  cwd: process.cwd(),
  product: 'aiReview',
  validate: true
});
const config = result.config;
```

### 3. Add Profile Support

```typescript
// Load with profile
const result = await loadBundle({
  cwd: process.cwd(),
  product: 'aiReview',
  profileKey: 'production',
  validate: true
});
```

### 4. Enable Validation

```typescript
// Validate configuration
const result = await loadBundle({
  cwd: process.cwd(),
  product: 'aiReview',
  validate: 'warn' // or true for strict validation
});
```

## Product-Specific Examples

### AI Review Migration

```typescript
// Before
const aiReviewConfig = {
  enabled: true,
  threshold: 0.8,
  rules: ['complexity', 'security']
};

// After
const result = await loadBundle({
  cwd: process.cwd(),
  product: 'aiReview',
  cli: { threshold: 0.9 }, // CLI override
  validate: true
});
```

### DevLink Migration

```typescript
// Before
const devlinkConfig = {
  enabled: true,
  port: 3000,
  host: 'localhost'
};

// After
const result = await loadBundle({
  cwd: process.cwd(),
  product: 'devlink',
  profileKey: 'development',
  validate: true
});
```

## CLI Migration

### Validate Configuration

```bash
# Before: Manual validation
node scripts/validate-config.js

# After: Built-in validation
kb config validate --product aiReview
```

## Benefits

1. **Unified API**: Single interface for all products
2. **Type Safety**: TypeScript support with validation
3. **Profile Support**: Easy configuration presets
4. **Validation**: Built-in schema validation
5. **CLI Integration**: Command-line tools included
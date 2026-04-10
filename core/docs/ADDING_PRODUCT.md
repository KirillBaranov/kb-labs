# Adding a New Product to Config System

## Overview

This guide explains how to add a new product to the KB Labs configuration system. Products are defined by their `ProductId` and have associated runtime defaults, file system mappings, and optionally profile exports.

## Steps

### 1. Add ProductId to Union Type

**File:** `packages/config/src/types/types.ts`

```typescript
// ProductId - можно расширять добавлением новых продуктов
export type ProductId = 
  | 'devlink' 
  | 'release' 
  | 'aiReview' 
  | 'aiDocs' 
  | 'devkit'
  | 'mind';  // ✅ Add your product here
```

### 2. Add Runtime Defaults

**File:** `packages/config/src/api/product-config.ts`

```typescript
function getRuntimeDefaults(product: ProductId): any {
  const defaults: Record<ProductId, any> = {
    devlink: {
      watch: true,
      build: true,
    },
    release: {
      version: '1.0.0',
      publish: false,
    },
    aiReview: {
      enabled: true,
      rules: [],
    },
    aiDocs: {
      enabled: true,
      templates: [],
    },
    devkit: {
      sync: true,
      check: true,
    },
    // ✅ Add your product defaults
    mind: {
      indexer: {
        enabled: true,
        maxFiles: 10000
      },
      query: {
        cacheMode: 'local'
      }
    }
  };
  
  return defaults[product] || {};
}
```

### 3. Add File System Mapping

**File:** `packages/config/src/utils/product-normalize.ts`

```typescript
export function toFsProduct(product: ProductId): string {
  const map: Record<ProductId, string> = {
    devlink: 'devlink',
    release: 'release',
    aiReview: 'ai-review',
    aiDocs: 'ai-docs',
    devkit: 'devkit',
    // ✅ Add your product mapping
    mind: 'mind'
  };
  return map[product] || product;
}
```

### 4. Define Product Profile Overlay (Profiles v2)

**File:** `kb.config.json` or `kb-labs.config.yaml` (in workspace)

Define your product's profile overlay structure in the `profiles[]` array:

```json
{
  "profiles": [
    {
      "id": "default",
      "label": "Default Profile",
      "products": {
        "mind": {
          "indexer": {
            "enabled": true,
            "maxFiles": 10000,
            "cacheDir": ".kb/mind/cache"
          },
          "query": {
            "cacheMode": "local",
            "timeout": 5000
          }
        }
      },
      "scopes": [
        {
          "id": "root",
          "include": ["**/*"],
          "default": true
        }
      ]
    }
  ]
}
```

**TypeScript Contract** (in your product package):

```typescript
// contracts/mind-profile.ts
import { z } from 'zod';

export const MindProfileOverlaySchema = z.object({
  indexer: z.object({
    enabled: z.boolean().optional(),
    maxFiles: z.number().optional(),
    cacheDir: z.string().optional(),
  }).optional(),
  query: z.object({
    cacheMode: z.enum(['local', 'remote']).optional(),
    timeout: z.number().optional(),
  }).optional(),
});

export type MindProfileOverlay = z.infer<typeof MindProfileOverlaySchema>;
```

**Reading from Bundle**:

```typescript
import { loadBundle } from '@kb-labs/core-bundle';
import { MindProfileOverlaySchema } from './contracts/mind-profile';

const bundle = await loadBundle({
  cwd: process.cwd(),
  product: 'mind',
  profileId: 'default', // optional
});

// Access profile overlay
const profileOverlay = bundle.profile?.products?.mind;
if (profileOverlay) {
  const validated = MindProfileOverlaySchema.parse(profileOverlay);
  // Use validated overlay
} else {
  // Use defaults, log warning if needed
}
```

### 5. (Optional) Add Product-Specific Policy Actions

**File:** `packages/policy/src/schema/policy-schema.ts` (if applicable)

```typescript
// Add product-specific actions
export const PRODUCT_ACTIONS = {
  aiReview: ['aiReview.run', 'aiReview.configure'],
  devlink: ['devlink.apply', 'devlink.watch'],
  // ✅ Add your product actions
  mind: ['mind.index', 'mind.query', 'mind.pack']
};
```

## Complete Example: Adding 'mind' Product

### Step 1: Update ProductId

```typescript
// packages/config/src/types/types.ts
export type ProductId = 
  | 'devlink' 
  | 'release' 
  | 'aiReview' 
  | 'aiDocs' 
  | 'devkit'
  | 'mind';
```

### Step 2: Add Runtime Defaults

```typescript
// packages/config/src/api/product-config.ts
const defaults: Record<ProductId, any> = {
  // ...existing products
  mind: {
    indexer: {
      enabled: true,
      maxFiles: 10000,
      cacheDir: '.kb/mind/cache'
    },
    query: {
      cacheMode: 'local',
      timeout: 5000
    },
    pack: {
      maxTokens: 100000,
      compress: true
    }
  }
};
```

### Step 3: Add FS Mapping

```typescript
// packages/config/src/utils/product-normalize.ts
const map: Record<ProductId, string> = {
  // ...existing mappings
  mind: 'mind'
};
```

### Step 4: Define Profile Overlay (Profiles v2)

**File:** `kb.config.json` or `kb-labs.config.yaml`

```json
{
  "profiles": [
    {
      "id": "default",
      "label": "Default Profile",
      "products": {
        "mind": {
          "indexer": {
            "enabled": true,
            "maxFiles": 10000,
            "cacheDir": ".kb/mind/cache"
          },
          "query": {
            "cacheMode": "local",
            "timeout": 5000
          }
        }
      },
      "scopes": [
        {
          "id": "root",
          "include": ["**/*"],
          "default": true
        }
      ]
    }
  ]
}
```

**Note**: With Profiles v2, profile overlays are defined directly in `kb.config.json`. The old `.kb/profiles/` structure is deprecated.

### Step 5: Test Integration

```typescript
// In your product code
import { loadBundle } from '@kb-labs/core-bundle';
import { MindProfileOverlaySchema } from './contracts/mind-profile';

const bundle = await loadBundle({
  cwd: process.cwd(),
  product: 'mind',
  profileId: 'default' // optional, uses default scope if available
});

// Access merged config (includes profile overlay)
const config = bundle.config as MindConfig;
console.log(config.indexer.maxFiles); // 10000 (from profile overlay or runtime defaults)
console.log(config.indexer.enabled);  // true (from profile overlay or runtime defaults)

// Access profile information
if (bundle.profile) {
  console.log('Profile ID:', bundle.profile.id);
  console.log('Active Scope:', bundle.profile.activeScope?.id);
  
  // Validate and use profile overlay
  const profileOverlay = bundle.profile.products?.mind;
  if (profileOverlay) {
    const validated = MindProfileOverlaySchema.parse(profileOverlay);
    // Use validated overlay
  }
}

// Access artifacts (if defined in profile)
const presets = await bundle.artifacts.list('query-presets');
await bundle.artifacts.materialize(['query-presets']);
```

## Checklist

- [ ] Added ProductId to union type
- [ ] Added runtime defaults
- [ ] Added file system mapping
- [ ] Defined ProductProfileOverlay TypeScript type and Zod schema
- [ ] Created profile overlay in `kb.config.json` (Profiles v2)
- [ ] (Optional) Added policy actions
- [ ] Tested with `loadBundle()` and profile overlay validation
- [ ] Updated documentation

## Notes

- **Runtime defaults**: Provide base values when no other configuration exists
- **File system mapping**: Controls where config files are stored
- **Profile overlays (Profiles v2)**: Product-specific configuration in `profiles[].products.<productId>`
- **Per-scope products**: Different configurations per scope (e.g., different engines for frontend vs backend)
- **Type safety**: Define Zod schema for profile overlay validation
- **Merge order**: runtime → profile → profile-scope → preset → workspace → local → CLI
- **Legacy profiles**: The old `.kb/profiles/` structure is deprecated; use `profiles[]` in `kb.config.json` instead

## Profiles v2 Migration

If you have existing profiles using the old `.kb/profiles/` structure:

1. Move profile defaults to `profiles[].products.<productId>` in `kb.config.json`
2. Update `loadBundle()` calls to use `profileId` instead of `profileKey`
3. Access profile overlay via `bundle.profile.products.<productId>` and validate with Zod schema
4. See [ADR-0010](./adr/0010-profiles-v2-architecture.md) for full migration guide


# @kb-labs/core-types

> **Shared TypeScript type definitions for KB Labs core packages.** Provides common types used across all KB Labs packages for consistency and type safety.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision & Purpose

**@kb-labs/core-types** provides shared TypeScript type definitions for KB Labs core packages. It ensures type consistency across the ecosystem and provides a single source of truth for common types like `ProductId`.

## 🏗️ Architecture

### Core Components

#### Type Definitions

- **Purpose**: Define shared types
- **Responsibilities**: Export types for use in other packages
- **Dependencies**: None (types only)

### Design Patterns

- **Type Library Pattern**: Centralized type definitions
- **Union Types**: ProductId as union type for type safety

### Data Flow

```
Import from @kb-labs/core-types
    │
    ├──► TypeScript compiler resolves types
    ├──► Types available at compile time
    └──► No runtime code
```

## 🚀 Quick Start

### Installation

```bash
pnpm add @kb-labs/core-types
```

### Basic Usage

```typescript
import type { ProductId } from '@kb-labs/core-types';

function processProduct(product: ProductId) {
  // Type-safe product handling
  switch (product) {
    case 'aiReview':
      // ...
      break;
    case 'aiDocs':
      // ...
      break;
  }
}
```

## ✨ Features

### Type Definitions

- **ProductId**: Union type for all KB Labs products
- **Type Safety**: Strong typing prevents invalid values
- **Consistency**: Single source of truth for product IDs

## 🔧 Configuration

### Configuration Options

No configuration needed (types only).

### Environment Variables

None (compile-time only).

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

KB Public License v1.1 © KB Labs

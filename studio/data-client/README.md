# @kb-labs/data-client

KB Labs Studio data client — API SDK with versioned contracts, mocks, and TanStack Query hooks.

## Vision & Purpose

**@kb-labs/data-client** provides API SDK for KB Labs Studio. It includes versioned contracts, mocks, and TanStack Query hooks for data fetching and state management.

### Core Goals

- **API SDK**: Type-safe API client for Studio
- **Versioned Contracts**: Versioned API contracts
- **Mocks**: Mock data sources for development
- **TanStack Query Hooks**: React hooks for data fetching

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
Data Client
    │
    ├──► HTTP Client
    ├──► Sources
    ├──► Hooks
    ├──► Contracts
    ├──► Schemas
    └──► Mocks
```

### Key Components

1. **HTTP Client** (`client/`): HTTP client implementation
2. **Sources** (`sources/`): Data sources (audit, release, system, workflows)
3. **Hooks** (`hooks/`): TanStack Query hooks
4. **Contracts** (`contracts/`): API contracts
5. **Schemas** (`schemas/`): Zod schemas for validation
6. **Mocks** (`mocks/`): Mock data sources

## ✨ Features

- **API SDK**: Type-safe API client for Studio
- **Versioned Contracts**: Versioned API contracts
- **Mocks**: Mock data sources for development
- **TanStack Query Hooks**: React hooks for data fetching (useAudit, useRelease, useSystem, useWorkflows)
- **Error Handling**: Unified error handling
- **Envelope Interceptor**: Response envelope interceptor

## 📦 API Reference

### Main Exports

#### HTTP Client

- `createHttpClient`: Create HTTP client instance
- `HttpClient`: HTTP client class

#### Sources

- `AuditSource`: Audit data source
- `ReleaseSource`: Release data source
- `SystemSource`: System data source
- `WorkflowSource`: Workflow data source

#### Hooks

- `useAudit`: Audit data hook
- `useRelease`: Release data hook
- `useSystem`: System data hook
- `useWorkflows`: Workflows data hook
- `useJobEvents`: Job events hook

#### Contracts

- `AuditContract`: Audit contract
- `ReleaseContract`: Release contract
- `SystemContract`: System contract
- `WorkflowContract`: Workflow contract

## 🔧 Configuration

### Configuration Options

All configuration via HTTP client factory.

## 🔗 Dependencies

### Runtime Dependencies

- `@tanstack/react-query` (`^5.62.23`): React Query
- `@kb-labs/api-contracts` (`link:../../../kb-labs-rest-api/packages/api-contracts`): API contracts
- `zod` (`^3.24.1`): Schema validation
- `ulid` (`^2.3.0`): ULID generation

### Development Dependencies

- `@kb-labs/devkit` (`file:../../../kb-labs-devkit`): DevKit presets
- `@types/node` (`^22.10.0`): Node.js types
- `@types/react` (`^18.3.18`): React types
- `react` (`^18.3.1`): React
- `tsup` (`^8`): TypeScript bundler
- `typescript` (`^5`): TypeScript compiler
- `vitest` (`^3.2.4`): Test runner

## 🧪 Testing

### Test Structure

```
src/sources/__tests__/
└── http-workflow-source.spec.ts
```

### Test Coverage

- **Current Coverage**: ~70%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(1) for client creation, O(n) for data fetching
- **Space Complexity**: O(1)
- **Bottlenecks**: Network requests

## 🔒 Security

### Security Considerations

- **API Authentication**: Secure API authentication
- **Request Validation**: Request validation via schemas

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Source Types**: Fixed source types
- **API Types**: Fixed API types

### Future Improvements

- **More Source Types**: Additional source types
- **Caching**: Enhanced caching support

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Use HTTP Client

```typescript
import { createHttpClient } from '@kb-labs/data-client';

const client = createHttpClient({
  baseURL: 'https://api.example.com',
});
```

### Example 2: Use Hooks

```typescript
import { useAudit, useRelease } from '@kb-labs/data-client';

function MyComponent() {
  const { data: audit } = useAudit();
  const { data: release } = useRelease();
  
  return <div>...</div>;
}
```

### Example 3: Use Mocks

```typescript
import { createMockAuditSource } from '@kb-labs/data-client';

const mockSource = createMockAuditSource();
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs


# @kb-labs/api-contracts

Shared API contracts for KB Labs REST, CLI, and Studio surfaces.

## Overview

Provides Zod schemas and TypeScript types for consistent API shapes across all KB Labs services.

## API Reference

### Error Codes

- `ErrorCode` — standardized error code enum
- `getErrorCode(error)` — extract error code from an error value

### Response Envelopes

- `SuccessEnvelope<T>` — `{ ok: true, data: T, meta }`
- `ErrorEnvelope` — `{ ok: false, error: { code, message, details?, traceId? }, meta }`

### System Types

- `SystemInfo` — system information shape
- `SystemHealth` — health snapshot shape
- `ReadyState` — readiness probe shape
- `isReady(state)` — type guard for readiness

## Usage

```typescript
import { ErrorCode, SuccessEnvelope, ErrorEnvelope } from '@kb-labs/api-contracts';

const success: SuccessEnvelope<{ id: string }> = {
  ok: true,
  data: { id: '01K...' },
  meta: { requestId: '01K...', durationMs: 12, apiVersion: '1.0.0' },
};

const error: ErrorEnvelope = {
  ok: false,
  error: { code: ErrorCode.INTERNAL_ERROR, message: 'Something went wrong' },
  meta: { requestId: '01K...', durationMs: 5, apiVersion: '1.0.0' },
};
```

## License

KB Public License v1.1 © KB Labs

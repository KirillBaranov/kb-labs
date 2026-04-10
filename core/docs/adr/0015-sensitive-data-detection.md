# ADR-0015: Sensitive Data Detection and Privacy Protection

**Date:** 2025-01-19
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-01-19
**Tags:** [architecture, logging, security, privacy, compliance]

## Context

Logs often contain sensitive information:
- API keys and authentication tokens
- Passwords and credentials
- Email addresses and phone numbers
- Credit card numbers and SSNs
- Environment variables with secrets
- Personal identifiable information (PII)

This creates several problems:
- Security risk if logs are leaked
- Compliance violations (GDPR, HIPAA, SOC2)
- Cannot use logs for AI training
- Difficult to share logs for debugging
- Legal liability

We need automatic detection and protection of sensitive data in logs:
- Detect sensitive data patterns
- Mask sensitive values automatically
- Mark logs with privacy metadata
- Prevent sensitive data from being used inappropriately
- Support compliance requirements

## Decision

We implement **automatic sensitive data detection and redaction** with multiple layers of protection.

### Architecture

```
┌─────────────────────────────────────────┐
│ Log Record                              │
│ - msg: "API key: sk_live_123..."        │
│ - meta: { apiKey: "secret", ... }       │
└─────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│ PII Detection Layer                      │
│                                         │
│ - Pattern matching (regex)              │
│ - Key name detection                    │
│ - Value pattern analysis                │
└─────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│ Redaction Layer                          │
│                                         │
│ - Mask sensitive values                 │
│ - Recursive object traversal            │
│ - Preserve structure                    │
└─────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│ Privacy Metadata                         │
│                                         │
│ - privacy.containsPII: true             │
│ - privacy.piiTypes: ['apiKey', 'email'] │
│ - privacy.sensitivity: 'confidential'   │
│ - privacy.aiTraining.allowed: false     │
└─────────────────────────────────────────┘
```

### Key Design Decisions

#### 1. Multi-Layer Detection

**Decision:** Use multiple detection strategies:
- Pattern matching (regex for values)
- Key name detection (sensitive key patterns)
- Value analysis (length, format patterns)

**Rationale:**
- No single strategy catches everything
- Multiple signals increase detection rate
- Can detect even if key name is obfuscated
- Works with various data formats

**Detection Patterns:**
```typescript
// API Keys
- Bearer tokens: /Bearer\s+[A-Za-z0-9\-_]{20,}/
- Long alphanumeric: /[A-Za-z0-9\-_]{32,}/
- JWT tokens: /[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/
- Stripe-like: /sk-[A-Za-z0-9]{32,}/

// PII
- Email: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/
- Phone: /\+?[1-9]\d{1,14}/
- Credit card: /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/
- SSN: /\d{3}-\d{2}-\d{4}/

// Sensitive Keys
- apiKey, api_key, api-key
- secretKey, secret_key
- password, passwd, pwd
- token, accessToken, refreshToken
- env, environment, config
```

#### 2. Automatic Redaction

**Decision:** Automatically mask sensitive values in logs.

**Rationale:**
- Prevents accidental exposure
- Works even if detection misses something
- Preserves log structure for debugging
- Configurable mask pattern

**Implementation:**
```typescript
const redactor = createRedactor({
    keys: ['apiKey', 'password', 'token'],
    mask: '****'
});

// { apiKey: 'secret' } → { apiKey: '****' }
```

#### 3. Privacy Metadata

**Decision:** Add privacy metadata to log records when sensitive data detected.

**Rationale:**
- Enables compliance tracking
- Prevents inappropriate use (e.g., AI training)
- Supports audit requirements
- Can be used for filtering

**Metadata Fields:**
- `containsPII` - boolean flag
- `piiTypes` - array of detected types
- `sensitivity` - level (public/internal/confidential/restricted)
- `aiTraining.allowed` - whether can be used for training
- `compliance` - applicable regulations

#### 4. Embedding Exclusion

**Decision:** Exclude sensitive data from embedding text preparation.

**Rationale:**
- Prevents sensitive data in AI embeddings
- Reduces risk of data leakage
- Maintains privacy in AI analysis
- Filters both keys and values

**Implementation:**
```typescript
// Sensitive keys filtered out
// Long suspicious values filtered out
const keyFields = Object.entries(meta)
    .filter(([k]) => !isSensitiveKey(k))
    .filter(([k, v]) => !isSensitiveValue(v))
```

#### 5. Default Sensitive Keys

**Decision:** Include comprehensive list of sensitive key patterns by default.

**Rationale:**
- Covers common cases out of the box
- Reduces configuration burden
- Consistent protection across platform
- Can be extended per use case

**Default Keys:**
- `token`, `apiKey`, `apikey`, `api_key`, `api-key`
- `secret`, `secretKey`, `secret_key`, `secret-key`
- `accessToken`, `refreshToken`, `authToken`, `bearerToken`
- `password`, `passwd`, `pwd`
- `privateKey`, `private_key`, `private-key`
- `authorization`
- `env`, `environment`, `config`

## Consequences

### Positive

- ✅ **Automatic protection** - detects and masks sensitive data
- ✅ **Multiple detection strategies** - catches various patterns
- ✅ **Privacy metadata** - enables compliance tracking
- ✅ **AI-safe** - prevents sensitive data in embeddings
- ✅ **Configurable** - can customize keys and patterns
- ✅ **Backward compatible** - works with existing code

### Negative

- ⚠️ **False positives** - may detect non-sensitive data
- ⚠️ **False negatives** - may miss some sensitive data
- ⚠️ **Pattern maintenance** - patterns need updates
- ⚠️ **Performance** - regex matching adds overhead

### Alternatives Considered

1. **Manual redaction**
   - Rejected: Too error-prone, developers forget

2. **ML-based detection**
   - Rejected: Requires training, slower, harder to debug

3. **External service**
   - Rejected: Adds latency, network dependency, cost

4. **No automatic detection**
   - Rejected: Too risky, compliance violations

## Implementation

### Key Files

- `kb-labs-core/packages/sys/src/logging/ai-enrichment.ts` - PII detection logic
- `kb-labs-core/packages/sys/src/logging/redaction.ts` - Redaction implementation

### Usage

```typescript
import { configureAI, getLogger, createRedactor } from '@kb-labs/core-sys/logging';

// Enable PII detection
configureAI({
    mode: 'basic',
    features: {
        privacy: {
            autoDetectPII: true,
            defaultSensitivity: 'confidential',
        },
    },
});

// Configure redaction
const redactor = createRedactor({
    keys: ['apiKey', 'password', 'token'],
    mask: '****',
});

configureLogger({ redactor });

const logger = getLogger('my-plugin');
logger.info('Request', { apiKey: 'secret-key' });
// Automatically detected and masked
```

### Configuration

```json
{
  "logging": {
    "ai": {
      "features": {
        "privacy": {
          "autoDetectPII": true,
          "defaultSensitivity": "confidential"
        }
      }
    },
    "redaction": {
      "enabled": true,
      "keys": ["apiKey", "password", "token", "env"],
      "mask": "****"
    }
  }
}
```

## References

- [ADR-0011: Unified Logging System](./0011-unified-logging-system.md)
- [ADR-0012: AI-Ready Log Enrichment](./0012-ai-ready-log-enrichment.md)
- [Sensitive Data Detection Guide](../../docs/logging-sensitive-data-detection.md)

---

**Last Updated:** 2025-01-19  
**Next Review:** 2025-07-19 (6 months)


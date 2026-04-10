# Package Architecture Description: @kb-labs/core-bundle

**Version**: 0.1.0
**Last Updated**: 2025-11-16
**Architect**: KB Labs Team

## Executive Summary

**@kb-labs/core-bundle** is an orchestration facade that provides a single entry point for all KB Labs products. It coordinates four major subsystems (configuration, profiles, artifacts, and policy) into a unified `Bundle` object. The package uses the Facade pattern to simplify complex interactions between multiple core packages, providing developers with a simple API while hiding the complexity of 6-layer configuration resolution, profile loading, artifact management, and policy enforcement.

## 1. Package Overview

### 1.1 Purpose & Scope

**Primary Purpose**: Provide a single entry point (`loadBundle()`) that orchestrates configuration resolution, profile loading, artifact management, and policy enforcement for all KB Labs products.

**Scope Boundaries**:
- **In Scope**: 
  - Orchestration of config, profiles, artifacts, and policy
  - Unified Bundle API for products
  - Workspace initialization (`initAll()`)
  - Configuration trace/explanation
  - Lazy artifact loading
- **Out of Scope**: 
  - Actual configuration resolution (delegated to `core-config`)
  - Profile loading implementation (delegated to `core-profiles`)
  - Policy rule evaluation (delegated to `core-policy`)
  - File system operations (delegated to `core-sys`)

**Domain**: Core Infrastructure / Orchestration Layer

### 1.2 Key Responsibilities

1. **Orchestration**: Coordinate multiple subsystems into unified Bundle object
2. **API Simplification**: Hide complexity of 6-layer config, profile resolution, and policy
3. **Lazy Loading**: Provide on-demand artifact access without upfront loading
4. **Backward Compatibility**: Support both Profiles v1 and v2 formats
5. **Initialization**: Provide workspace setup via `initAll()`

### 1.3 Non-Goals

- **Direct File System Access**: Bundle doesn't read files directly, delegates to subsystems
- **Configuration Schema Definition**: Schema definitions are product-specific, bundle just resolves
- **Policy Rule Definition**: Policy rules come from policy bundles, bundle just enforces
- **Profile Creation**: Profile creation is separate, bundle only loads existing profiles

## 2. High-Level Architecture

### 2.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│              User Code / Products                       │
│  (ai-review, ai-docs, devlink, etc.)                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ loadBundle({ product, ... })
                     ▼
┌─────────────────────────────────────────────────────────┐
│         @kb-labs/core-bundle                             │
│         (Orchestration Facade)                          │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ loadBundle() │  │explainBundle()│ │  initAll()   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │           │
│         └─────────────────┴──────────────────┘           │
│                          │                                │
└──────────────────────────┼────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────────┐ ┌──────────────┐ ┌──────────────┐
│ core-config     │ │core-profiles │ │core-policy  │
│ (6-layer merge) │ │(load & cache)│ │(resolve &    │
│                 │ │              │ │ enforce)     │
└─────────────────┘ └──────────────┘ └──────────────┘
         │                 │                 │
         └─────────────────┴─────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   core-sys      │
                  │ (logging, fs)   │
                  └─────────────────┘
```

### 2.2 Architectural Style

- **Style**: Facade Pattern with Orchestration
- **Rationale**: Simplifies complex subsystem interactions. Bundle doesn't implement functionality itself, but coordinates multiple specialized packages. This provides:
  - Single responsibility: Each subsystem handles its domain
  - Loose coupling: Bundle depends on interfaces, not implementations
  - Easy testing: Can mock subsystems independently
  - Maintainability: Changes to subsystems don't require bundle changes

### 2.3 Core Principles

1. **Single Entry Point**: All KB Labs products use `loadBundle()` - no direct subsystem access
2. **Lazy Loading**: Artifacts loaded on-demand, not upfront
3. **Stateless API**: Each `loadBundle()` call is independent, no shared mutable state
4. **Error Transparency**: Errors from subsystems are wrapped in `KbError` with helpful hints
5. **Backward Compatibility**: Support legacy formats while migrating to new ones

### 2.4 Architectural Constraints

- **No Direct I/O**: Bundle delegates all file system operations to subsystems
- **No Caching**: Bundle doesn't cache, relies on subsystem caches (LRU in config/profiles)
- **Synchronous API**: All operations are async but sequential (no parallel loading)
- **Single Workspace**: One workspace root per call (no multi-workspace support)

## 3. Component Architecture

### 3.1 Component Overview

```
core-bundle/
├── src/
│   ├── index.ts                    # Public API exports
│   ├── types/
│   │   └── types.ts                # TypeScript interfaces
│   └── api/
│       ├── load-bundle.ts          # Main orchestration
│       ├── explain-bundle.ts       # Trace-only loading
│       └── init-all.ts            # Workspace initialization
```

### 3.2 Component: `load-bundle.ts`

#### Purpose
Main orchestration function that coordinates all subsystems to create a Bundle object.

#### Responsibilities
- Resolve workspace root directory
- Load workspace configuration
- Resolve profile (v1 or v2)
- Merge 6-layer configuration
- Resolve policy rules
- Create artifacts wrapper (lazy-loaded)
- Create policy wrapper
- Return unified Bundle object

#### Interface
```typescript
export async function loadBundle<T = any>(
  opts: LoadBundleOptions
): Promise<Bundle<T>>
```

#### Dependencies
- **Internal**: 
  - `@kb-labs/core-config`: Configuration resolution (`getProductConfig`, `resolveProfileV2`)
  - `@kb-labs/core-profiles`: Profile loading (`loadProfile`, `extractProfileInfo`)
  - `@kb-labs/core-policy`: Policy resolution (`resolvePolicy`, `createPermitsFunction`)
  - `@kb-labs/core-sys`: Output utilities (`createOutput`)
  - `@kb-labs/core-workspace`: Workspace root resolution (`resolveWorkspaceRoot`)
- **External**: 
  - `node:fs/promises`: File system operations (minimal, mostly delegated)
  - `node:path`: Path manipulation

#### Data Structures
- `LoadBundleOptions`: Input options (cwd, product, profileId, etc.)
- `Bundle<T>`: Output bundle object (config, profile, artifacts, policy, trace)
- `BundleProfile`: Profile information from config system
- `ProfileInfo`: Legacy profile information

#### State Management
- **State Type**: Local (per function call)
- **State Storage**: Function-local variables, no shared state
- **State Lifecycle**: Created at start of `loadBundle()`, returned at end
- **Caching**: Delegated to subsystems (config/profiles use LRU cache)

#### Error Handling
- **Error Types**: `KbError` with error codes (`ERR_CONFIG_NOT_FOUND`, `ERR_PROFILE_NOT_DEFINED`)
- **Error Propagation**: Errors thrown, caught by caller
- **Recovery Strategy**: No automatic recovery, caller must handle
- **Error Logging**: Structured logging via platform logger adapters

#### Performance Characteristics
- **Time Complexity**: O(n) where n = number of config layers + profile depth
- **Space Complexity**: O(m) where m = size of cached config/profile
- **Bottlenecks**: 
  - File I/O for workspace config and profile loading
  - Configuration merge (6 layers)
  - Profile resolution (may involve multiple extends)

### 3.3 Component: `explain-bundle.ts`

#### Purpose
Provides configuration resolution trace without side effects (no file writes, no caching).

#### Responsibilities
- Load bundle using `loadBundle()`
- Extract and return trace information
- No side effects (read-only operation)

#### Interface
```typescript
export async function explainBundle(
  opts: ExplainBundleOptions
): Promise<MergeTrace[]>
```

#### Dependencies
- **Internal**: `loadBundle()` function
- **External**: None

#### Performance Characteristics
- **Time Complexity**: Same as `loadBundle()` (calls it internally)
- **Space Complexity**: O(t) where t = trace size
- **Bottlenecks**: Same as `loadBundle()`

### 3.4 Component: `init-all.ts`

#### Purpose
Orchestrates workspace initialization (config, profiles, policy, lockfile).

#### Responsibilities
- Initialize workspace configuration
- Initialize profile structure
- Initialize policy configuration
- Create/update lockfile
- Aggregate statistics

#### Interface
```typescript
export async function initAll(
  opts: InitAllOptions
): Promise<InitAllResult>
```

#### Dependencies
- **Internal**: 
  - `@kb-labs/core-config`: Workspace initialization
  - `@kb-labs/core-profiles`: Profile initialization
  - `@kb-labs/core-policy`: Policy initialization
- **External**: 
  - `node:fs/promises`: File system operations
  - `node:path`: Path manipulation

#### Performance Characteristics
- **Time Complexity**: O(f) where f = number of files to create
- **Space Complexity**: O(1) (minimal state)
- **Bottlenecks**: File system I/O

### 3.5 Component: Artifacts Wrapper

#### Purpose
Provides lazy-loaded artifact access without upfront loading.

#### Responsibilities
- List available artifacts (from profile exports)
- Materialize artifacts to filesystem
- Read artifact content (text/JSON)
- Read all artifacts for a key

#### Interface
```typescript
interface ArtifactsAPI {
  summary: Record<string, string[]>;
  list(key: string): Promise<Array<{ relPath: string; sha256: string }>>;
  materialize(keys?: string[]): Promise<MaterializeResult>;
  readText(relPath: string): Promise<string>;
  readJson<T = any>(relPath: string): Promise<T>;
  readAll(key: string): Promise<Array<{ path: string; content: string }>>;
}
```

#### Dependencies
- **Internal**: `@kb-labs/core-profiles` for artifact operations
- **External**: None

#### Performance Characteristics
- **Time Complexity**: O(a) where a = number of artifacts
- **Space Complexity**: O(1) (lazy loading, no upfront allocation)
- **Bottlenecks**: File I/O for artifact reading

## 4. Data Flow

### 4.1 Input Sources

- **Workspace Config**: `kb-labs.config.yaml` or `kb-labs.config.json` (from filesystem)
- **Profile Config**: Profile manifest files (from filesystem or npm)
- **Local Config**: `.kb/<product>/<product>.config.json` (from filesystem)
- **CLI Overrides**: Command-line arguments (from function parameters)

### 4.2 Processing Pipeline

```
User Code
    │
    ▼
loadBundle({ product, profileId, ... })
    │
    ├──► resolveWorkspaceRoot() → cwd
    │
    ├──► readWorkspaceConfig(cwd) → workspace config
    │
    ├──► readProfilesSection(cwd) → available profiles
    │
    ├──► resolveProfileV2({ cwd, profileId }) → bundleProfile
    │
    ├──► selectProfileScope({ bundleProfile, scopeId }) → scope selection
    │
    ├──► getProductConfig({ product, profileLayer, cli }) → merged config (6 layers)
    │       │
    │       ├──► Runtime defaults
    │       ├──► Profile defaults
    │       ├──► Preset defaults
    │       ├──► Workspace config
    │       ├──► Local config
    │       └──► CLI overrides
    │
    ├──► resolvePolicy({ presetBundle, overrides }) → policy rules
    │
    ├──► createArtifactsWrapper(profileInfo) → artifacts API
    │
    └──► return Bundle { config, profile, artifacts, policy, trace }
```

### 4.3 Output Destinations

- **Return Value**: Bundle object returned to caller
- **Optional**: Final config written to disk (if `writeFinalConfig: true`)
- **Logging**: Structured logs via platform logger adapters

### 4.4 Data Transformations

- **Product Normalization**: `aiReview` (camelCase) ↔ `ai-review` (kebab-case)
- **Config Merging**: 6 layers merged with later layers overriding earlier
- **Profile Resolution**: Profile references resolved to actual profile objects
- **Artifact Path Resolution**: Relative paths resolved to absolute paths

## 5. Design Patterns

### 5.1 Patterns Used

#### Pattern: Facade

- **Where Used**: Entire package
- **Purpose**: Simplify complex subsystem interactions
- **Implementation**: Bundle provides simple API (`loadBundle()`) that hides complexity of config/profiles/policy coordination
- **Benefits**: 
  - Single entry point for all products
  - Easier to use than coordinating subsystems directly
  - Changes to subsystems don't affect bundle API
- **Trade-offs**: 
  - Additional abstraction layer (slight performance overhead)
  - Less flexibility than direct subsystem access

#### Pattern: Lazy Loading

- **Where Used**: Artifacts wrapper
- **Purpose**: Avoid loading artifacts until needed
- **Implementation**: Artifacts wrapper provides methods that load on-demand
- **Benefits**: 
  - Faster initial bundle loading
  - Lower memory usage
  - Only load what's needed
- **Trade-offs**: 
  - First access to artifact has latency
  - Errors only discovered when accessing artifact

#### Pattern: Builder

- **Where Used**: `loadBundle()` function
- **Purpose**: Build complex Bundle object step-by-step
- **Implementation**: Sequential steps build up Bundle object
- **Benefits**: 
  - Clear flow of operations
  - Easy to add new steps
  - Can abort early on errors
- **Trade-offs**: Sequential execution (no parallelization)

#### Pattern: Strategy

- **Where Used**: Profile format support (v1/v2)
- **Purpose**: Support multiple profile formats
- **Implementation**: Conditional logic checks format and uses appropriate resolver
- **Benefits**: 
  - Backward compatibility
  - Gradual migration path
- **Trade-offs**: 
  - Code complexity (two code paths)
  - Maintenance burden (need to support both)

## 6. State Management

### 6.1 State Architecture

- **State Type**: Local (per function call)
- **State Storage**: Function-local variables, no shared mutable state
- **State Persistence**: No persistence (stateless API)

### 6.2 State Lifecycle

```
loadBundle() called
    │
    ├──► Create local variables
    ├──► Resolve workspace root
    ├──► Load config/profile/policy
    ├──► Create Bundle object
    └──► Return Bundle (state destroyed)
```

### 6.3 State Consistency

- **Consistency Model**: N/A (no shared state)
- **Consistency Guarantees**: Each call is independent
- **Conflict Resolution**: N/A

### 6.4 State Synchronization

- **Sync Mechanism**: N/A (no shared state)
- **Sync Frequency**: N/A
- **Sync Failures**: N/A

## 7. Concurrency & Parallelism

### 7.1 Concurrency Model

- **Model**: Single-threaded (Node.js event loop)
- **Rationale**: All operations are async but execute sequentially. No need for multi-threading as operations are I/O-bound, not CPU-bound.

### 7.2 Thread Safety

- **Thread Safety**: N/A (single-threaded)
- **Synchronization Mechanisms**: N/A
- **Race Conditions**: None (sequential execution)

### 7.3 Parallelism

- **Parallel Operations**: None currently (all sequential)
- **Parallelism Strategy**: N/A
- **Limitations**: Sequential execution may be slower than parallel, but simpler and more predictable

## 8. Error Handling & Resilience

### 8.1 Error Handling Strategy

- **Error Types**: `KbError` with error codes and hints
- **Error Propagation**: Errors thrown, caught by caller
- **Error Recovery**: No automatic recovery (caller must handle)
- **Error Logging**: Structured logging via platform logger adapters

### 8.2 Resilience Patterns

- **Fail Fast**: Errors thrown immediately, no partial state
- **Clear Error Messages**: `KbError` includes helpful hints
- **Error Codes**: Standardized error codes for programmatic handling

### 8.3 Failure Modes

- **Workspace Not Found**: Throws `ERR_CONFIG_NOT_FOUND` with hint
- **Profile Not Found**: Throws `ERR_PROFILE_NOT_DEFINED` with available profiles
- **Config Validation Failure**: Throws validation error with details
- **File System Errors**: Propagated from subsystems

## 9. Performance Architecture

### 9.1 Performance Design

- **Performance Goals**: 
  - Bundle loading < 100ms for typical workspace
  - Artifact access < 50ms per artifact
- **Performance Characteristics**: 
  - Time: O(n) where n = config layers + profile depth
  - Space: O(m) where m = cached config/profile size
- **Optimization Strategies**: 
  - LRU caching in subsystems (config/profiles)
  - Lazy artifact loading
  - Minimal file I/O (delegated to subsystems)

### 9.2 Scalability

- **Horizontal Scaling**: Not applicable (local file system)
- **Vertical Scaling**: Limited by file system I/O
- **Scaling Limitations**: Single workspace per call

### 9.3 Caching Strategy

- **Cache Type**: LRU cache in subsystems (not in bundle)
- **Cache Invalidation**: Automatic (subsystems handle)
- **Cache Hit Rate**: High for repeated calls with same workspace/profile

## 10. Security Architecture

### 10.1 Security Model

- **Security Boundaries**: Workspace root prevents path traversal
- **Trust Model**: Trusts workspace configuration and profiles
- **Threat Model**: 
  - Path traversal attacks (prevented by workspace root)
  - Malicious profile configs (validated by subsystems)
  - Policy bypass (enforced by policy subsystem)

### 10.2 Security Mechanisms

- **Input Validation**: All inputs validated via TypeScript types and Zod schemas
- **Path Resolution**: Workspace root resolution prevents path traversal
- **Policy Enforcement**: All operations checked against policy rules
- **Profile Security**: Profile loading uses security constraints from `core-profiles`

### 10.3 Security Considerations

- **Input Validation**: All function parameters validated
- **Output Sanitization**: N/A (returns structured data, not user-facing)
- **Secrets Management**: N/A (no secrets handled)
- **Authentication**: N/A (local file system only)
- **Authorization**: Policy subsystem handles authorization

## 11. Integration Architecture

### 11.1 Integration Points

#### CLI Integration
- **How**: CLI commands call `loadBundle()` to get configuration
- **Interface**: `loadBundle()` function
- **Data Flow**: CLI → `loadBundle()` → Bundle → CLI uses config

#### REST API Integration
- **How**: REST API endpoints call `loadBundle()` for product config
- **Interface**: `loadBundle()` function
- **Data Flow**: REST → `loadBundle()` → Bundle → REST returns config

#### Product Integration
- **How**: All KB Labs products use `loadBundle()` as entry point
- **Interface**: `loadBundle()` function
- **Data Flow**: Product → `loadBundle()` → Bundle → Product uses config/artifacts/policy

### 11.2 Integration Patterns

- **Facade Pattern**: Bundle provides unified interface for all integrations
- **Dependency Injection**: Subsystems injected via imports (not runtime)

## 12. Testing Architecture

### 12.1 Testing Strategy

- **Unit Testing**: Test individual functions (`loadBundle`, `explainBundle`, `initAll`)
- **Integration Testing**: Test with real workspace fixtures
- **E2E Testing**: N/A (bundle is used by products, not end-user facing)

### 12.2 Test Architecture

- **Test Organization**: Tests in `src/__tests__/` directory
- **Test Fixtures**: Workspace fixtures in `__fixtures__/` directory
- **Mocking Strategy**: Mock subsystems for unit tests, use real subsystems for integration tests

## 13. Deployment Architecture

### 13.1 Deployment Model

- **Deployment Type**: Library package (imported by other packages)
- **Deployment Requirements**: Node.js 18.18.0+, pnpm 9.0.0+
- **Deployment Constraints**: None (pure TypeScript/JavaScript)

### 13.2 Runtime Environment

- **Node.js Version**: >= 18.18.0
- **External Dependencies**: None (all internal to kb-labs-core)
- **Resource Requirements**: Minimal (memory for cached config/profiles)

## 14. Evolution & Extensibility

### 14.1 Extension Points

- **Custom Profile Formats**: Can add new profile format support in `loadBundle()`
- **Additional Bundle Properties**: Can extend `Bundle` interface
- **Custom Artifact Handlers**: Can extend artifacts wrapper

### 14.2 Evolution Strategy

- **Backward Compatibility**: Maintained via Profile v1/v2 support
- **Migration Path**: Gradual migration from v1 to v2
- **Deprecation Strategy**: Profile v1 will be deprecated in v1.0.0

## 15. Architectural Decisions

### 15.1 Key Decisions

#### Decision: Facade Pattern for Orchestration

- **Date**: 2024-01-01
- **Context**: Need to simplify complex subsystem coordination
- **Decision**: Use Facade pattern to provide single entry point
- **Rationale**: 
  - Simplifies API for products
  - Hides complexity of 6-layer config
  - Easier to maintain than direct subsystem access
- **Alternatives**: 
  - Direct subsystem access (more complex for users)
  - Builder pattern (more verbose API)
- **Consequences**: 
  - Additional abstraction layer
  - Slight performance overhead
  - Easier to use and maintain

#### Decision: Lazy Artifact Loading

- **Date**: 2024-01-15
- **Context**: Artifacts may be large and not always needed
- **Decision**: Load artifacts on-demand, not upfront
- **Rationale**: 
  - Faster initial bundle loading
  - Lower memory usage
  - Only load what's needed
- **Alternatives**: 
  - Eager loading (slower, higher memory)
  - Hybrid (complex, unclear benefits)
- **Consequences**: 
  - First artifact access has latency
  - Errors only discovered when accessing

#### Decision: Support Both Profile v1 and v2

- **Date**: 2024-02-01
- **Context**: Migration from Profile v1 to v2 in progress
- **Decision**: Support both formats during transition
- **Rationale**: 
  - Backward compatibility
  - Gradual migration path
  - No breaking changes
- **Alternatives**: 
  - Only v2 (breaking change)
  - Only v1 (no migration path)
- **Consequences**: 
  - Code complexity (two code paths)
  - Maintenance burden
  - Will remove v1 in v1.0.0

## 16. Diagrams

### 16.1 Component Diagram

```
┌─────────────────────────────────────────┐
│         @kb-labs/core-bundle           │
│                                         │
│  ┌──────────────┐  ┌──────────────┐   │
│  │ loadBundle() │  │explainBundle()│  │
│  └──────┬───────┘  └──────┬───────┘   │
│         │                 │            │
│         └────────┬────────┘            │
│                  │                     │
│         ┌────────▼────────┐           │
│         │  initAll()      │           │
│         └────────┬────────┘           │
└──────────────────┼────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
    ▼              ▼              ▼
┌─────────┐  ┌──────────┐  ┌──────────┐
│ config  │  │ profiles │  │  policy  │
└─────────┘  └──────────┘  └──────────┘
```

### 16.2 Sequence Diagram

```
User Code          Bundle          Config        Profiles      Policy
    │                │               │              │            │
    │ loadBundle()   │               │              │            │
    ├───────────────>│               │              │            │
    │                │ resolveRoot() │              │            │
    │                ├──────────────>│              │            │
    │                │<──────────────┤              │            │
    │                │ resolveProfile()             │            │
    │                ├─────────────────────────────>│            │
    │                │<─────────────────────────────┤            │
    │                │ getProductConfig()           │            │
    │                ├──────────────>│              │            │
    │                │<──────────────┤              │            │
    │                │ resolvePolicy()                         │
    │                ├─────────────────────────────────────────>│
    │                │<─────────────────────────────────────────┤
    │                │ createArtifactsWrapper()                 │
    │                │ (lazy, no call yet)                     │
    │<───────────────┤               │              │            │
    │  Bundle        │               │              │            │
    │                │               │              │            │
    │ artifacts.list()│              │              │            │
    ├───────────────>│               │              │            │
    │                │ listArtifacts()             │            │
    │                ├─────────────────────────────>│            │
    │                │<─────────────────────────────┤            │
    │<───────────────┤               │              │            │
```

## 17. Related Documentation

- [README.md](../README.md) - Package overview and usage
- [Core Config Documentation](../../config/README.md) - Configuration system
- [Core Profiles Documentation](../../profiles/README.md) - Profile system
- [Core Policy Documentation](../../policy/README.md) - Policy system

---

**Last Updated**: 2025-11-16
**Next Review**: 2025-12-16

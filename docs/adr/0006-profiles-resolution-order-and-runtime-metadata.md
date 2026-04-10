# ADR-0006: Profiles: Resolution Order, System Defaults and Runtime Metadata

**Date:** 2025-01-05
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, data, observability]  

## Context

The Profiles system needed to be enhanced with:
1. **Consistent resolution order** - Clear precedence for profile inheritance
2. **System defaults** - Fallback values for missing configuration fields
3. **Runtime metadata** - Debugging and analytics information
4. **Performance tracing** - Timing information for optimization

Without these features, profile resolution was inconsistent and lacked observability.

## Decision

### 1. Resolution Order

Implement strict resolution order:
```
SYSTEM_DEFAULTS → extends (left→right) → local profile → overrides (left→right) → validate → apply defaults
```

**Rationale**: Clear precedence ensures predictable behavior and makes debugging easier.

### 2. System Defaults

Create `SYSTEM_DEFAULTS` with minimal safe values:
- `io`: Empty allow/deny arrays, no symlinks
- `diff`: Empty include/exclude arrays
- `capabilities`: All flags disabled, empty tools array

**Rationale**: Prevents undefined behavior when fields are missing.

### 3. Runtime Metadata

Add `meta.extra` field to `ResolvedProfile` containing:
- Creation timestamp
- Resolver version and configuration
- Source paths and working directory
- Extends/overrides chains
- File counts
- Performance traces

**Rationale**: Enables debugging, analytics, and performance optimization.

### 4. Logging Levels

Support `KB_PROFILES_LOG_LEVEL` environment variable:
- `silent` | `error` | `warn` | `info` | `debug`

**Rationale**: Flexible logging for different environments and debugging needs.

## Alternatives Considered

### Alternative 1: No System Defaults
**Rejected**: Would require every profile to define all fields, leading to verbose configurations and potential errors.

### Alternative 2: Profile-Level Defaults Only
**Rejected**: Inconsistent behavior across profiles and harder to maintain.

### Alternative 3: No Runtime Metadata
**Rejected**: Would make debugging and performance optimization difficult.

### Alternative 4: Separate Metadata Package
**Rejected**: Adds complexity without significant benefit for current use cases.

## Consequences

### Positive
- **Predictable behavior**: Clear resolution order eliminates ambiguity
- **Better debugging**: Runtime metadata provides comprehensive context
- **Performance insights**: Timing data enables optimization
- **Consistent defaults**: System defaults prevent configuration errors
- **Flexible logging**: Environment-appropriate log levels

### Negative
- **Increased complexity**: More fields and options to understand
- **Larger objects**: Runtime metadata adds to memory usage
- **Performance overhead**: Timing collection has minimal cost

### Risks
- **Breaking changes**: New `meta.extra` field might affect existing code
- **Configuration drift**: System defaults might mask configuration issues

## Implementation Details

### Files Modified
- `packages/profiles/src/meta/build-meta.ts` - Metadata building
- `packages/profiles/src/defaults/system-defaults.ts` - System defaults
- `packages/profiles/src/api/resolve-profile.ts` - Resolution pipeline
- `packages/profiles/src/types/types.ts` - Type definitions

### Backward Compatibility
- Existing `ResolvedProfile.meta` structure preserved
- New `meta.extra` field is optional
- All existing APIs continue to work

### Performance Impact
- Minimal overhead for timing collection (~0.1ms)
- Metadata building adds ~0.05ms per resolution
- Logging overhead only in debug mode

## Monitoring

Track the following metrics:
- Resolution time per profile
- Cache hit rates
- Validation error rates
- Most common extends/overrides patterns

## Future Considerations

1. **Metadata persistence**: Store resolution metadata for historical analysis
2. **Performance optimization**: Use timing data to optimize slow operations
3. **Configuration validation**: Validate system defaults against schema
4. **Metrics export**: Export performance data to monitoring systems

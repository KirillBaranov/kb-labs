# ADR-0010: Deterministic Output Strategy for Stable Context Packs

**Date:** 2025-10-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, data]

## Context

KB Labs Mind generates context packs (Markdown and JSON) that are consumed by AI tools like Cursor. These outputs must be deterministic to ensure:

- Consistent results across runs
- Stable diffs in version control
- Reliable AI context regardless of system state
- Predictable behavior for users

The system processes multiple files, dependencies, and git changes, which could lead to non-deterministic ordering and output.

## Decision

We will implement a comprehensive deterministic output strategy:

1. **JSON Key Sorting**: Recursively sort all object keys in JSON artifacts
2. **Stable Section Ordering**: Fixed order for context pack sections
3. **File Processing Order**: Sort file paths before processing
4. **Consistent Formatting**: Standardized whitespace and encoding
5. **Versioned Schema**: All artifacts include `schemaVersion: "1.0"`

## Rationale

### Why Deterministic Output?

- **AI Consistency**: AI tools get the same context every time
- **Version Control**: Stable diffs, no noise in commits
- **Debugging**: Easier to identify what changed between runs
- **User Trust**: Predictable behavior builds confidence
- **CI/CD**: Reliable automated processes

### Implementation Strategy

#### JSON Key Sorting

```typescript
// Recursive key sorting for all JSON outputs
function sortKeysRecursively(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sortKeysRecursively);
  }
  if (obj !== null && typeof obj === 'object') {
    const sorted: any = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = sortKeysRecursively(obj[key]);
    });
    return sorted;
  }
  return obj;
}

// Atomic write with sorted keys
async function writeJson(path: string, data: any): Promise<void> {
  const sorted = sortKeysRecursively(data);
  const content = JSON.stringify(sorted, null, 2) + '\n';
  // ... atomic write logic
}
```

#### Stable Section Ordering

```typescript
// Fixed order for context pack sections
const SECTION_ORDER: ContextSection[] = [
  'intent_summary',
  'product_overview', 
  'api_signatures',
  'recent_diffs',
  'impl_snippets',
  'configs_profiles'
];

// Build sections in deterministic order
for (const section of SECTION_ORDER) {
  const content = buildSection(section, data);
  sections[section] = content;
}
```

#### File Processing Order

```typescript
// Sort file paths before processing
const sortedFiles = Object.keys(apiIndex.files).sort();
for (const filePath of sortedFiles) {
  // Process files in alphabetical order
}
```

## Consequences

### Positive

- **Stable Outputs**: Identical results across runs
- **Clean Diffs**: Only meaningful changes in version control
- **AI Consistency**: Reliable context for AI tools
- **Debugging**: Easy to identify what changed
- **User Trust**: Predictable behavior

### Negative

- **Performance**: Sorting adds small overhead
- **Complexity**: More complex serialization logic
- **Memory**: Additional sorting operations

### Mitigation Strategies

- **Efficient Sorting**: Use native JavaScript sort (O(n log n))
- **Lazy Sorting**: Only sort when writing to disk
- **Caching**: Cache sorted results when possible

## Implementation Details

### JSON Artifacts

All JSON files in `.kb/mind/` follow this format:

```typescript
interface ArtifactBase {
  schemaVersion: "1.0";
  generator: string; // "kb-labs-mind@0.1.0"
  // ... other fields
}
```

### Context Pack Structure

```typescript
interface ContextPackJson {
  schemaVersion: "1.0";
  generator: string;
  intent: string;
  product?: string;
  budgetApplied: ContextBudget;
  sections: Record<ContextSection, string>; // Ordered by SECTION_ORDER
  tokensEstimate: number;
  sectionTokens: Partial<Record<ContextSection, number>>;
}
```

### File Processing

```typescript
// Deterministic file processing
const files = Object.keys(apiIndex.files).sort();
for (const filePath of files) {
  // Process in alphabetical order
  const apiFile = apiIndex.files[filePath];
  // ... processing logic
}
```

### Atomic Writes

```typescript
// Atomic write with deterministic formatting
async function writeJson(path: string, data: any): Promise<void> {
  const tmp = `${path}.tmp`;
  const sorted = sortKeysRecursively(data);
  const content = JSON.stringify(sorted, null, 2) + '\n';
  
  await fsp.writeFile(tmp, content, 'utf8');
  await fsp.rename(tmp, path);
}
```

## Testing Strategy

### Determinism Tests

```typescript
describe('Deterministic Output', () => {
  it('should produce identical JSON on multiple runs', async () => {
    const result1 = await buildPack(opts);
    const result2 = await buildPack(opts);
    
    expect(result1.json).toEqual(result2.json);
    expect(result1.markdown).toBe(result2.markdown);
  });
  
  it('should have sorted keys in all JSON artifacts', async () => {
    const artifacts = await updateIndexes(opts);
    
    // Verify all JSON files have sorted keys
    expect(artifacts.apiIndex).toHaveSortedKeys();
    expect(artifacts.depsGraph).toHaveSortedKeys();
  });
});
```

### Stability Tests

```typescript
describe('Output Stability', () => {
  it('should maintain stable section order', () => {
    const pack = buildPack(opts);
    const sections = Object.keys(pack.json.sections);
    
    expect(sections).toEqual(SECTION_ORDER);
  });
});
```

## Alternatives Considered

### Natural Ordering
- **Pros**: Simpler implementation
- **Cons**: Non-deterministic, unstable diffs
- **Decision**: Rejected - too unpredictable

### User-Configurable Ordering
- **Pros**: Flexibility for different use cases
- **Cons**: Complexity, harder to reason about
- **Decision**: Rejected - deterministic is better default

### Hash-Based Ordering
- **Pros**: Consistent across systems
- **Cons**: Not human-readable, harder to debug
- **Decision**: Rejected - alphabetical is more intuitive

## References

- [ADR-0009: Fail-Open Philosophy](./0009-fail-open-philosophy.md)
- [KB Labs Mind MVP Plan](../kb-labs-mind-mvp.plan.md)
- [JSON Schema Specification](https://json-schema.org/)

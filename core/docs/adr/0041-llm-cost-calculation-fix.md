# ADR-0041: LLM Cost Calculation Fix for Versioned Model Names

**Date:** 2026-01-02
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-01-02
**Tags:** [analytics, llm, cost-estimation, adapters]

## Context

The `AnalyticsLLM` wrapper in `@kb-labs/core-platform` tracks LLM usage and calculates cost estimates for analytics. However, the current implementation has three critical issues:

### Problem 1: Missing Modern Models

The pricing map does not include modern OpenAI models (`gpt-4o-mini`, `gpt-4o`), causing fallback to outdated `gpt-3.5-turbo` pricing:

```typescript
const pricing = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  // ❌ Missing: gpt-4o-mini, gpt-4o
};
```

### Problem 2: Incorrect Cost Units

Prices are specified as "per 1K tokens" but should be "per 1M tokens" (OpenAI's 2025 pricing standard):

```typescript
const inputCost = (promptTokens / 1000) * (modelPricing?.input ?? 0);
// ❌ Should divide by 1_000_000
```

### Problem 3: Versioned Model Names from API

OpenAI API returns **snapshot names with dates** even when using aliases:

- Request: `gpt-4o-mini` → Response: `gpt-4o-mini-2024-07-18`
- Request: `gpt-4o` → Response: `gpt-4o-2024-05-13`

Current matching logic uses `includes()` without sorting, causing incorrect matches:

```typescript
for (const [key, price] of Object.entries(pricing)) {
  if (model.includes(key)) {  // ❌ Problem!
    modelPricing = price;
    break;
  }
}
```

If pricing map is `{'gpt-4o': ..., 'gpt-4o-mini': ...}`, then:
- `'gpt-4o-mini-2024-07-18'.includes('gpt-4o')` → **true** (wrong match!)
- Uses `gpt-4o` pricing ($2.50/$10.00) instead of `gpt-4o-mini` ($0.15/$0.60)

### Impact

Analytics dashboards in Studio show `$0.00` cost for all LLM requests because:
1. Models like `gpt-4o-mini-2024-07-18` fallback to wrong pricing
2. Division by 1K instead of 1M makes costs 1000x smaller
3. Small costs round to $0.00 in UI

## Decision

Update `estimateCost()` function in `analytics-llm.ts` with:

1. **Add 2025 OpenAI pricing** (per 1M tokens)
2. **Fix cost calculation** to divide by 1,000,000
3. **Sort pricing keys by length** (longest first) to match specific models before generic ones

### New Implementation

```typescript
/**
 * Estimate cost based on model and token usage.
 * Prices as of 2025-01 (USD per 1M tokens).
 *
 * Note: OpenAI API returns versioned snapshot names (e.g., 'gpt-4o-mini-2024-07-18')
 * even when using aliases (e.g., 'gpt-4o-mini'). We match by prefix using longest-first
 * sorting to ensure specific models match before generic ones.
 */
function estimateCost(response: LLMResponse): number {
  const model = response.model.toLowerCase();
  const { promptTokens, completionTokens } = response.usage;

  // Pricing map (input / output per 1M tokens)
  // Source: OpenAI Pricing (2025-01), Anthropic Pricing (2025-01)
  const pricing: Record<string, { input: number; output: number }> = {
    // OpenAI models (2025-01 pricing)
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-4': { input: 30.00, output: 60.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },

    // Claude models (2025-01 pricing)
    'claude-3-opus': { input: 15.00, output: 75.00 },
    'claude-3-sonnet': { input: 3.00, output: 15.00 },
    'claude-3-haiku': { input: 0.25, output: 1.25 },
  };

  // Sort keys by length (longest first) to match specific models before generic ones
  // Example: 'gpt-4o-mini' should match before 'gpt-4o'
  // This handles versioned names: 'gpt-4o-mini-2024-07-18' → 'gpt-4o-mini' ✅
  const sortedKeys = Object.keys(pricing).sort((a, b) => b.length - a.length);

  // Find matching pricing
  let modelPricing = pricing['gpt-4o-mini']; // Default to cheapest OpenAI model
  for (const key of sortedKeys) {
    if (model.includes(key)) {
      modelPricing = pricing[key]!;
      break;
    }
  }

  // Calculate cost (per 1M tokens)
  const inputCost = (promptTokens / 1_000_000) * modelPricing.input;
  const outputCost = (completionTokens / 1_000_000) * modelPricing.output;

  return inputCost + outputCost;
}
```

## Consequences

### Positive

- **Accurate cost tracking**: Analytics dashboards show real costs instead of $0.00
- **Modern model support**: Handles `gpt-4o-mini` and `gpt-4o` correctly
- **Handles versioned names**: Works with API snapshot names like `gpt-4o-mini-2024-07-18`
- **Future-proof**: Sorting by length ensures new model versions work automatically
- **Simple solution**: No regex needed, just array sorting

### Negative

- **Manual pricing updates**: Need to update pricing map when providers change rates
- **Estimations only**: Actual costs may vary due to:
  - Cached prompts (50% discount on OpenAI)
  - Batch API pricing differences
  - Regional pricing variations
- **Performance**: Sorting keys on every call (negligible, ~8 keys)

### Alternatives Considered

**Alternative 1: Regex matching with word boundaries**

```typescript
const regex = new RegExp(`^${key}(-|$)`);
if (regex.test(model)) { ... }
```

❌ Rejected: More complex, no significant benefit over sorting

**Alternative 2: External pricing API**

Fetch real-time pricing from OpenAI/Anthropic APIs.

❌ Rejected:
- Adds API dependencies and latency
- Most providers don't offer pricing APIs
- Pricing rarely changes (quarterly at most)

**Alternative 3: Exact model version mapping**

Map every snapshot version to pricing:

```typescript
'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.60 },
'gpt-4o-mini-2024-11-05': { input: 0.15, output: 0.60 },
```

❌ Rejected: Unmaintainable, breaks when new snapshots released

## Implementation

### Changes Required

1. **Update `analytics-llm.ts`** ([kb-labs-core/packages/core-platform/src/wrappers/analytics-llm.ts:139-166](kb-labs-core/packages/core-platform/src/wrappers/analytics-llm.ts#L139-L166))
   - Add modern OpenAI models to pricing map
   - Update pricing to "per 1M tokens"
   - Add key sorting before matching

2. **No schema changes**: `estimatedCost` field in analytics events remains the same

3. **No migration needed**: Fix applies to future events only

### Testing

Test cases for model name matching:

| Input Model | Expected Match | Expected Pricing |
|-------------|----------------|------------------|
| `gpt-4o-mini-2024-07-18` | `gpt-4o-mini` | $0.15/$0.60 |
| `gpt-4o-2024-05-13` | `gpt-4o` | $2.50/$10.00 |
| `gpt-4-turbo-2024-04-09` | `gpt-4-turbo` | $10.00/$30.00 |
| `gpt-4-0125-preview` | `gpt-4` | $30.00/$60.00 |
| `claude-3-opus-20240229` | `claude-3-opus` | $15.00/$75.00 |
| `unknown-model` | fallback | $0.15/$0.60 (gpt-4o-mini) |

Cost calculation test:

```typescript
// Example: 186 prompt tokens, 138 completion tokens, gpt-4o-mini
inputCost = (186 / 1_000_000) * 0.15 = $0.0000279
outputCost = (138 / 1_000_000) * 0.60 = $0.0000828
total = $0.0001107
```

### Maintenance

- **Review pricing**: Quarterly (Jan, Apr, Jul, Oct)
- **Add new models**: When providers release new models
- **Update this ADR**: When pricing methodology changes

### Rollout

- ✅ No breaking changes
- ✅ Backward compatible (existing events use old pricing)
- ✅ New events get correct pricing immediately
- ✅ No database migration required

## References

- **OpenAI Pricing (2025-01)**: https://openai.com/api/pricing/
- **Anthropic Pricing (2025-01)**: https://www.anthropic.com/pricing
- **OpenAI Model Versioning**: https://platform.openai.com/docs/models/continuous-model-upgrades
- **Related Issue**: Analytics dashboard shows $0.00 cost for LLM usage
- **Implementation**: `kb-labs-core/packages/core-platform/src/wrappers/analytics-llm.ts`

---

**Last Updated:** 2026-01-02
**Next Review:** 2026-04-01 (Quarterly pricing review)

# ADR-0011: Token Estimation Strategy for Context Budget Management

**Date:** 2025-10-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, observability]

## Context

KB Labs Mind generates context packs with token budget constraints to ensure AI tools receive appropriately sized context. We need a strategy for:

- Estimating token counts for text content
- Truncating content to fit within budget limits
- Managing per-section token caps
- Providing accurate budget tracking

The system must work without external dependencies while being accurate enough for practical use.

## Decision

We will implement a **pluggable token estimation strategy** with a default whitespace-aware heuristic:

1. **ITokenEstimator Interface**: Pluggable strategy for different tokenizers
2. **Default Heuristic**: Whitespace-aware estimation (~4 chars/token)
3. **Truncation Modes**: Start, middle, end truncation strategies
4. **Budget Tracking**: Per-section and total token usage
5. **Future-Proof**: Easy to integrate tiktoken or other tokenizers

## Rationale

### Why Pluggable Strategy?

- **Flexibility**: Can switch to more accurate tokenizers later
- **No Dependencies**: Default works without external libraries
- **Performance**: Fast heuristic for real-time usage
- **Accuracy**: Good enough for practical context management
- **Upgrade Path**: Easy to integrate tiktoken or other tokenizers

### Implementation Strategy

#### Core Interface

```typescript
export interface ITokenEstimator {
  estimate(text: string): number;
  truncate(text: string, maxTokens: number, mode: "start"|"middle"|"end"): string;
}

export class DefaultTokenEstimator implements ITokenEstimator {
  private readonly charsPerToken = 4.0;
  private readonly codeBonus = 0.2;
  
  estimate(text: string): number {
    const words = text.split(/\s+/).filter(Boolean).length;
    const punctuation = (text.match(/[.,;!?'"-(){}[\]]/g) || []).length;
    const codeBonus = (text.match(/[{}[\];=<>]/g) || []).length * 0.5;
    
    return Math.ceil(words + punctuation * 0.5 + codeBonus);
  }
  
  truncate(text: string, maxTokens: number, mode: "start"|"middle"|"end"): string {
    if (this.estimate(text) <= maxTokens) return text;
    
    const lines = text.split('\n');
    const targetLines = Math.floor(lines.length * (maxTokens / this.estimate(text)));
    
    switch (mode) {
      case 'start': return lines.slice(0, targetLines).join('\n');
      case 'end': return lines.slice(-targetLines).join('\n');
      case 'middle': 
      default: {
        const startLines = Math.floor(targetLines / 2);
        const endLines = targetLines - startLines;
        return [...lines.slice(0, startLines), '...', ...lines.slice(-endLines)].join('\n');
      }
    }
  }
}
```

#### Budget Management

```typescript
interface ContextBudget {
  totalTokens: number;
  caps: Partial<Record<ContextSection, number>>;
  truncation: "start" | "middle" | "end";
}

// Default budget configuration
export const DEFAULT_BUDGET: ContextBudget = {
  totalTokens: 9000,
  caps: {
    intent_summary: 300,
    product_overview: 600,
    project_meta: 500,
    api_signatures: 2200,
    recent_diffs: 1200,
    docs_overview: 600,
    impl_snippets: 3000,
    configs_profiles: 700,
  },
  truncation: "middle",
};
```

#### Per-Section Tracking

```typescript
interface ContextPackJson {
  schemaVersion: "1.0";
  intent: string;
  budgetApplied: ContextBudget;
  sections: Record<ContextSection, string>;
  tokensEstimate: number;
  sectionTokens: Partial<Record<ContextSection, number>>; // Per-section usage
}
```

## Consequences

### Positive

- **Flexibility**: Easy to switch tokenizers
- **Performance**: Fast heuristic estimation
- **Accuracy**: Good enough for practical use
- **No Dependencies**: Works out of the box
- **Budget Control**: Precise token management

### Negative

- **Approximation**: Heuristic is not 100% accurate
- **Language Bias**: Optimized for English/code
- **Context Loss**: Truncation might lose important information

### Mitigation Strategies

- **Conservative Estimates**: Slightly overestimate to avoid overflow
- **Smart Truncation**: Middle truncation preserves context
- **Section Prioritization**: Important sections get higher caps
- **Future Integration**: Easy to add tiktoken later

## Implementation Details

### Token Estimation Algorithm

```typescript
class DefaultTokenEstimator implements ITokenEstimator {
  estimate(text: string): number {
    // Word-based estimation
    const words = text.split(/\s+/).filter(Boolean).length;
    
    // Punctuation weight
    const punctuation = (text.match(/[.,;!?'"-(){}[\]]/g) || []).length;
    
    // Code bonus for programming content
    const codeIndicators = (text.match(/[{}[\];=<>]/g) || []).length;
    const codeBonus = codeIndicators * 0.5;
    
    // Character-based fallback
    const charBased = text.length / this.charsPerToken;
    
    // Use the higher estimate for safety
    return Math.ceil(Math.max(words + punctuation * 0.5 + codeBonus, charBased));
  }
}
```

### Truncation Strategies

```typescript
truncate(text: string, maxTokens: number, mode: "start"|"middle"|"end"): string {
  if (this.estimate(text) <= maxTokens) return text;
  
  const lines = text.split('\n');
  const targetLines = Math.max(1, Math.floor(lines.length * (maxTokens / this.estimate(text))));
  
  switch (mode) {
    case 'start':
      return lines.slice(0, targetLines).join('\n');
    case 'end':
      return lines.slice(-targetLines).join('\n');
    case 'middle':
    default: {
      const startLines = Math.max(1, Math.floor(targetLines / 2));
      const endLines = Math.max(1, targetLines - startLines);
      return [...lines.slice(0, startLines), '...', ...lines.slice(-endLines)].join('\n');
    }
  }
}
```

### Budget Enforcement

```typescript
// Apply budget caps to sections
for (const [section, content] of Object.entries(sections)) {
  const cap = budget.caps[section as ContextSection] || budget.totalTokens;
  const truncated = estimator.truncate(content, cap, budget.truncation);
  sections[section] = truncated;
  
  // Track usage
  sectionTokens[section] = estimator.estimate(truncated);
}
```

## Testing Strategy

### Estimation Accuracy

```typescript
describe('Token Estimation', () => {
  it('should estimate tokens for simple text', () => {
    const text = 'Hello world, this is a test.';
    const tokens = estimator.estimate(text);
    expect(tokens).toBeGreaterThan(0);
  });
  
  it('should apply code bonus for code-like content', () => {
    const code = 'function test() { return true; }';
    const normal = 'This is normal text';
    
    const codeTokens = estimator.estimate(code);
    const normalTokens = estimator.estimate(normal);
    
    expect(codeTokens).toBeGreaterThan(normalTokens);
  });
});
```

### Truncation Behavior

```typescript
describe('Truncation', () => {
  it('should truncate text correctly', () => {
    const text = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    const truncated = estimator.truncate(text, 2, 'middle');
    
    expect(truncated).toContain('Line 1');
    expect(truncated).toContain('Line 5');
    expect(truncated).toContain('...');
  });
});
```

## Future Integration

### Tiktoken Integration

```typescript
// Future: Easy integration with tiktoken
export class TiktokenEstimator implements ITokenEstimator {
  private encoder: any;
  
  constructor() {
    // Initialize tiktoken encoder
    this.encoder = tiktoken.get_encoding("cl100k_base");
  }
  
  estimate(text: string): number {
    return this.encoder.encode(text).length;
  }
  
  truncate(text: string, maxTokens: number, mode: "start"|"middle"|"end"): string {
    const tokens = this.encoder.encode(text);
    if (tokens.length <= maxTokens) return text;
    
    // Truncate tokens and decode back
    const truncated = this.truncateTokens(tokens, maxTokens, mode);
    return this.encoder.decode(truncated);
  }
}
```

## Alternatives Considered

### Fixed Character Ratio
- **Pros**: Simple implementation
- **Cons**: Inaccurate for different content types
- **Decision**: Rejected - too simplistic

### External Tokenizer Only
- **Pros**: Maximum accuracy
- **Cons**: External dependency, slower
- **Decision**: Rejected - need fallback option

### User-Configurable Strategy
- **Pros**: Flexibility
- **Cons**: Complexity, harder to reason about
- **Decision**: Rejected - good default is better

## References

- [ADR-0010: Deterministic Output Strategy](./0010-deterministic-output-strategy.md)
- [OpenAI Tiktoken](https://github.com/openai/tiktoken)
- [KB Labs Mind MVP Plan](../kb-labs-mind-mvp.plan.md)

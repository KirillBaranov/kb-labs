# ADR-0021: Action Conditional Visibility (Extensible)

**Status:** Accepted
**Date:** 2025-12-30
**Deciders:** Studio Team
**Last Reviewed:** 2025-12-30
**Tags:** studio, actions, contracts, extensibility, jsonlogic

## Context

Widget actions (buttons, menu items) often need conditional rendering based on:
- **Widget data state** (e.g., "Apply" only when plan exists)
- **Execution context** (e.g., "Push" only after commits applied)
- **User permissions** (future: RBAC-based visibility)

The MVP currently supports only static boolean `visible` and `disabled` fields, but future requirements will demand dynamic evaluation based on runtime data.

### Requirements

1. **MVP**: Support static boolean values (simple, no dependencies)
2. **Future**: Support dynamic expressions without breaking changes
3. **Extensibility**: Leave room for JSONLogic or custom evaluators
4. **Developer Experience**: Clear, type-safe, well-documented

## Decision

Extend `WidgetAction` interface to support **union types** for `visible` and `disabled`:

```typescript
export interface WidgetAction {
  id: string;
  label: string;
  icon?: string;
  variant?: 'primary' | 'default' | 'danger';
  handler: ActionHandler;
  confirm?: ActionConfirm;

  /**
   * Disabled state
   * - boolean: static disabled state (MVP)
   * - string: JSONLogic expression evaluated against widget data (future)
   */
  disabled?: boolean | string;

  /**
   * Visibility
   * - boolean: static visibility (MVP)
   * - string: JSONLogic expression evaluated against widget data (future)
   */
  visible?: boolean | string;

  order?: number;
}
```

### Implementation Strategy

**Phase 1 (MVP - Current):**
- `boolean` values work as-is
- No JSONLogic dependency
- Zero breaking changes

**Phase 2 (Future - When Needed):**
- Add JSONLogic library
- Implement `evaluateCondition(expression, data)` utility
- Update `ActionToolbar` to evaluate `string` expressions
- Backward compatible (boolean still works)

### Code Example (MVP)

```typescript
// manifest.ts
actions: [
  {
    id: 'generate',
    label: 'Generate Plan',
    variant: 'primary',
    handler: { type: 'rest', routeId: 'generate', method: 'POST' },
    // Always visible
  },
  {
    id: 'apply',
    label: 'Apply Commits',
    handler: { type: 'rest', routeId: 'apply', method: 'POST' },
    // Static visibility for now
    visible: true,
  },
]
```

### Code Example (Future JSONLogic)

```typescript
actions: [
  {
    id: 'apply',
    label: 'Apply Commits',
    handler: { type: 'rest', routeId: 'apply', method: 'POST' },
    // Show only if plan exists
    visible: '{"exists": [{"var": "commits"}]}',
  },
  {
    id: 'push',
    label: 'Push',
    handler: { type: 'rest', routeId: 'push', method: 'POST' },
    // Show only if status = applied
    visible: '{"==": [{"var": "status"}, "applied"]}',
  },
  {
    id: 'generate',
    label: 'Generate Plan',
    handler: { type: 'rest', routeId: 'generate', method: 'POST' },
    // Disable while generating
    disabled: '{"==": [{"var": "isGenerating"}, true]}',
  },
]
```

### Implementation in `ActionToolbar`

```typescript
// apps/studio/src/components/action-toolbar.tsx (lines 56-76)

const visibleActions = React.useMemo(() => {
  return actions
    .filter((action) => {
      // Boolean visibility (MVP)
      if (typeof action.visible === 'boolean') {
        return action.visible;
      }

      // JSONLogic expression (future)
      if (typeof action.visible === 'string') {
        // TODO: Implement JSONLogic evaluator when needed
        // return evaluateCondition(action.visible, widgetData);
        console.warn(`[ActionToolbar] JSONLogic not yet supported: ${action.visible}`);
        return true; // Fail open for future compatibility
      }

      // Default: visible
      return true;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}, [actions]);
```

## Consequences

### Positive

- **Zero breaking changes**: Existing `boolean` values work as-is
- **Future-proof**: Contract ready for JSONLogic without migration
- **Fail-safe**: Unknown string expressions default to `true` (fail open)
- **Type-safe**: TypeScript enforces `boolean | string` union
- **Incremental adoption**: Add JSONLogic only when needed

### Negative

- **Two code paths**: Boolean vs string evaluation (minimal complexity)
- **JSONLogic dependency**: Will be needed in future (acceptable trade-off)
- **Runtime validation**: String expressions only validated at runtime (mitigated by fail-safe)

### Alternatives Considered

#### 1. Static boolean only
- **Pros**: Simple, no dependencies
- **Cons**: Not extensible, requires refactor later
- **Decision**: ❌ Rejected - not future-proof

#### 2. JSONLogic from day one
- **Pros**: Full power immediately
- **Cons**: Overengineering for MVP, adds dependency
- **Decision**: ❌ Rejected - YAGNI principle

#### 3. Custom DSL
- **Pros**: Tailored to our needs
- **Cons**: Reinventing the wheel, maintenance burden
- **Decision**: ❌ Rejected - use proven solution

#### 4. Callback functions
- **Pros**: Maximum flexibility
- **Cons**: Not declarative, can't serialize in manifest JSON
- **Decision**: ❌ Rejected - breaks declarative manifest pattern

## Implementation

### Phase 1 (Current - MVP)

**Changed files:**
1. `kb-labs-studio/packages/studio-contracts/src/actions.ts`
   - Extended `WidgetAction.disabled` to `boolean | string`
   - Extended `WidgetAction.visible` to `boolean | string`
   - Added JSDoc with examples

2. `kb-labs-studio/apps/studio/src/components/action-toolbar.tsx`
   - Added type guards for `typeof === 'boolean'`
   - Added stub for `typeof === 'string'` with console.warn
   - Fail-safe: defaults to `true` for unknown strings

**Migration needed:**
- ✅ None - fully backward compatible

### Phase 2 (Future - When JSONLogic Needed)

**Steps:**
1. Add dependency: `pnpm add json-logic-js @types/json-logic-js`
2. Create utility: `studio/src/utils/condition-evaluator.ts`
3. Update `action-toolbar.tsx`: replace TODO with `evaluateCondition()`
4. Update manifests: change boolean to JSONLogic strings where needed
5. Write ADR for evaluator implementation

**Example evaluator:**
```typescript
// studio/src/utils/condition-evaluator.ts
import jsonLogic from 'json-logic-js';

export function evaluateCondition(
  expression: string,
  data: unknown
): boolean {
  try {
    const rule = JSON.parse(expression);
    return jsonLogic.apply(rule, data);
  } catch (error) {
    console.error('[evaluateCondition] Parse error:', error);
    return true; // Fail open
  }
}
```

**Will this be revisited?**
- Yes, when first real use case for conditional actions emerges
- Estimated timeline: Q1 2025 (commit plugin or workflow plugin)

## References

- **JSONLogic**: https://jsonlogic.com/
- **Related ADRs**:
  - [ADR-0019: Registry Flatten in Provider](./0019-registry-flatten-in-provider.md) - provides `widgetData` context
  - [ADR-0020: Declarative Event-to-Params Mapping](./0020-declarative-event-to-params-mapping.md) - similar declarative approach
- **Implementation**:
  - `kb-labs-studio/packages/studio-contracts/src/actions.ts`
  - `kb-labs-studio/apps/studio/src/components/action-toolbar.tsx`

---

**Last Updated:** 2025-12-30
**Next Review:** When JSONLogic implementation is needed (Q1 2025)

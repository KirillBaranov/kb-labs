# ADR-0014: Unified UI/Output API via ctx.ui

**Status**: ✅ Implemented
**Date**: 2025-12-13
**Decision makers**: Architecture team
**Related**: ADR-0013 (Sandbox stdout piping)
**Tags:** `plugin-runtime`, `ui`, `output`, `cli`, `developer-experience`

## Context

Previously, we had three overlapping concepts for output in plugin handlers:

1. **ctx.ui** (UIFacade from plugin-runtime) - Rich formatting with colors, symbols, sideBox
2. **ctx.output** (Output from core-sys) - Logging with verbosity levels, but also had `ctx.output.ui` (duplicate!)
3. **OutputHelpers** (from shared-command-kit) - High-level result builders

**Problems:**
- **Duplication**: `ctx.output.ui` and `ctx.ui` were the same thing, causing confusion
- **Wrong location**: Output interface was in core-sys (system utilities), not UI layer
- **Incomplete API**: ctx.ui only had low-level formatting, no high-level helpers
- **Sandbox issues**: Neither worked properly in sandbox child processes

## Decision

**Migrate everything to `ctx.ui`, deprecate `ctx.output`.**

### New UIFacade API

```typescript
interface UIFacade extends PresenterFacade {
  // HIGH-LEVEL API (auto-format + auto-log)
  success(title: string, data?: { summary?, sections?, timing? }): void;
  showError(title: string, error: Error | string, options?): void;
  warning(title: string, warnings: string[], options?): void;
  info(title: string, data?: { summary?, sections? }): void;

  // LOW-LEVEL API (format only, returns string)
  sideBox(options: SideBoxOptions): string;
  box(title: string, content?: string[]): string;
  table(rows: TableRow[], headers?: string[]): string[];
  keyValue(pairs: Record<string, string | number>): string[];
  list(items: string[]): string[];

  // STYLING
  readonly colors: UIColors;
  readonly symbols: UISymbols;

  // PROGRESS
  spinner(text: string): Spinner;
  startProgress/updateProgress/completeProgress/failProgress();

  // OUTPUT MODES
  json(data: unknown): void;
  write(text: string): void;
}
```

### Implementations

1. **CliUIFacade** - CLI parent process
   - Uses `@kb-labs/shared-cli-ui` for formatting
   - Respects verbosity levels (quiet/normal/verbose)
   - Supports JSON mode

2. **NoopUI** - REST/Workflow/Jobs contexts
   - No terminal output
   - All methods are no-ops or return empty strings

3. **Sandbox** - Uses stdout piping (ADR-0013)
   - Can use CliUIFacade, output gets piped to parent

## Migration

```typescript
// OLD (deprecated):
ctx.output.success('Done', data);
ctx.output.ui.sideBox(options);
ctx.output.error(err);

// NEW:
ctx.ui.success('Done', data);
ctx.ui.sideBox(options);
ctx.ui.showError('Error', err);
```

**Backward compatibility**: `ctx.output` remains available but marked `@deprecated`.

## Consequences

### Positive

✅ **Single unified API** - One way to do output, not three
✅ **No duplication** - Removed `ctx.output.ui` vs `ctx.ui` confusion
✅ **Clean architecture** - Output moved from core-sys to plugin-runtime
✅ **Type safety** - Full TypeScript support with IntelliSense
✅ **Ergonomic** - High-level helpers for common cases, low-level for control
✅ **Works everywhere** - CLI, sandbox, REST, workflow with proper adapters

### Negative

⚠️ **Migration needed** - Existing code using `ctx.output` should migrate (but still works)
⚠️ **Method renamed** - `error()` → `showError()` to avoid conflict with PresenterFacade

## Implementation

**Phase 1**: Expand UIFacade interface ✅
- Added high-level methods: success(), showError(), warning(), info()
- Added low-level methods: sideBox(), box(), table(), keyValue(), list()
- Added progress methods and output modes

**Phase 2**: Implement adapters ✅
- Created CliUIFacade using shared-cli-ui
- Updated NoopUI with all new methods
- Added dependency: `@kb-labs/shared-cli-ui`

**Phase 3**: Deprecate ctx.output ✅
- Marked with `@deprecated` in PluginContextV2
- Provided migration guide in JSDoc

**Phases 4-6**: Optional
- Migrate existing usage (can be done incrementally)
- Add useUI() helper (for utilities without ctx)
- Update documentation

## Files Modified

- `kb-labs-plugin/packages/plugin-runtime/src/presenter/presenter-facade.ts` - UIFacade interface
- `kb-labs-plugin/packages/plugin-runtime/src/presenter/cli-ui-facade.ts` - NEW: CLI implementation
- `kb-labs-plugin/packages/plugin-runtime/src/presenter/http-presenter.ts` - Updated for new signatures
- `kb-labs-plugin/packages/plugin-runtime/src/presenter/job-runner-presenter.ts` - Updated for new signatures
- `kb-labs-plugin/packages/plugin-runtime/src/context/plugin-context-v2.ts` - Deprecated ctx.output
- `kb-labs-plugin/packages/plugin-runtime/package.json` - Added shared-cli-ui dependency

## Examples

### High-level usage (recommended)

```typescript
async handler(ctx: PluginContextV2) {
  ctx.ui.success('Build Complete', {
    summary: { 'Files': 42, 'Duration': '1.2s' },
    sections: [{ header: 'Output', items: ['dist/index.js'] }],
    timing: 1200
  });

  ctx.ui.showError('Build Failed', new Error('Type errors'), {
    suggestions: ['Run tsc --noEmit']
  });
}
```

### Low-level usage (manual control)

```typescript
async handler(ctx: PluginContextV2) {
  const box = ctx.ui.sideBox({
    title: 'Custom Output',
    sections: [{ items: ['Line 1', 'Line 2'] }],
    status: 'info'
  });
  console.log(box); // Manual output
}
```

### Styling utilities

```typescript
const greenText = ctx.ui.colors.success('All good!');
const icon = ctx.ui.symbols.success; // '✓'
```

## Future Work

- [ ] Migrate existing ctx.output usages to ctx.ui (incremental)
- [ ] Add useUI() convenience helper (optional)
- [ ] Update plugin templates to use ctx.ui
- [ ] Remove ctx.output entirely in v3.0

# KB Labs Studio Refactoring Baseline

**Date:** 2026-01-27
**Branch:** `refactor/phase-0-preparation`
**Purpose:** Document current state before starting refactoring for Senior React portfolio

---

## Phase 0: Preparation - Status

### ✅ Completed

1. **E2E Test Structure Created**
   - Created `tests/e2e/critical-paths/` directory
   - Added 3 test files:
     - `dashboard.spec.ts` - Dashboard loading and widget rendering
     - `navigation.spec.ts` - Route navigation tests
     - `data-fetching.spec.ts` - API integration and error handling

2. **Test Execution**
   - Playwright configured and browsers installed
   - Total tests: 28
   - Passing: 6
   - Failing: 20
   - Skipped: 2

3. **Baseline Established**
   - Current E2E test baseline documented
   - Tests will be refined in Phase 0 to match actual UI selectors

### 🔄 Next Steps (Remaining in Phase 0)

1. **Fix E2E Tests to Match Actual UI**
   - Update selectors in dashboard.spec.ts
   - Update selectors in navigation.spec.ts
   - Adjust data-fetching.spec.ts expectations
   - Target: All critical path tests passing

2. **Run Quality Baseline**
   ```bash
   pnpm qa:full
   pnpm qa:save
   ```

3. **Document Metrics**
   - Type safety percentage
   - Test coverage
   - Bundle size
   - Lighthouse score

---

## Current Project State (Before Refactoring)

### File Structure
```
kb-labs-studio/
├── apps/
│   └── studio/                    # Main Vite React app
│       ├── src/
│       │   ├── components/        # React components
│       │   ├── routes/            # React Router pages
│       │   ├── hooks/             # Custom hooks
│       │   └── providers/         # Context providers
│       └── tests/                 # (now empty, moved to root)
├── packages/
│   ├── studio-contracts/          # Type contracts
│   ├── studio-data-client/        # API client
│   ├── studio-ui-core/            # Core UI logic
│   └── studio-ui-react/           # Component library
├── tests/
│   └── e2e/                       # E2E tests (Playwright)
│       ├── critical-paths/        # NEW: Safety net tests
│       ├── dashboard.spec.ts      # OLD: Existing tests
│       └── settings.spec.ts       # OLD: Existing tests
└── docs/
    ├── refactor-baseline.md       # This file
    └── plans/
        └── 2026-01-27-studio-refactoring-plan.md  # Master plan
```

### Known Issues (To Be Fixed in Refactoring)

#### Type Safety (Phase 1 Target)
- 20+ uses of `React.ComponentType<any>`
- Global window pollution: `(window as any).__KB_LABS_API_BASE_URL__`
- Untyped widget props (runtime risk)

#### Architecture (Phase 2 Target)
- `widget-renderer.tsx`: 528 lines (too complex)
- `router.tsx`: 707 lines (layout logic mixed with routing)
- Duplicate widget state patterns (20+ files)

#### Performance (Phase 3 Target)
- `usePolling` hook: potential memory leak
- Widget registry: O(n) fallback lookup
- No React.memo on expensive components

#### Testing (Phase 4 Target)
- Current E2E coverage: 28 tests (many failing)
- Unit test coverage: ~5%
- Missing: accessibility tests, visual regression

---

## E2E Test Results (Initial Baseline)

### Test Execution Summary
```
Total: 28 tests
✅ Passed: 6 (21%)
❌ Failed: 20 (71%)
⏭️  Skipped: 2 (7%)

Duration: 1.1 minutes
```

### Failing Tests Breakdown

**Dashboard Tests (4 failing)**
- `should load dashboard page successfully` - Title/nav selector mismatch
- `should render widgets on dashboard` - Widget selector needs adjustment
- `should handle navigation to dashboard from other pages` - Navigation flow
- `should display page without console errors` - Console error detection

**Navigation Tests (12 failing)**
- All route navigation tests failing due to selector mismatches
- Routes tested: /, /observability/logs, /incidents, /metrics, /analytics, /workflows, /settings

**Data Fetching Tests (5 failing)**
- API integration tests failing (need mock data mode or real backend)
- Error handling tests need adjustment

**Old Tests (2 failing)**
- `dashboard.spec.ts` - H1 selector issue
- `settings.spec.ts` - H1 selector issue

### Passing Tests (6 total)
- Navigation: should handle 404 for unknown routes ✅
- Navigation: should navigate between pages using UI ✅
- Navigation: should handle back/forward browser navigation ✅
- Widget Interactions: should allow clicking on widgets ✅
- Sidebar Navigation: should toggle sidebar if present ✅
- Real-time Updates: should handle polling/real-time updates ✅

---

## Metrics to Track

### Type Safety
- [ ] Measure: Count of `any` types in codebase
- [ ] Current: 20+ known instances
- [ ] Target: 0 (Phase 1)

### Test Coverage
- [ ] Measure: Jest/Vitest coverage report
- [ ] Current: ~5%
- [ ] Target: 80%+ (Phase 4)

### Bundle Size
- [ ] Measure: `pnpm build && ls -lh apps/studio/dist/assets/*.js`
- [ ] Current: Not measured yet
- [ ] Target: <500KB gzipped (Phase 6)

### Performance
- [ ] Measure: Lighthouse CI score
- [ ] Current: Not measured yet
- [ ] Target: 90+ (Phase 6)

### Accessibility
- [ ] Measure: axe-core violations count
- [ ] Current: Not measured yet
- [ ] Target: 0 violations (Phase 6)

---

## Git Workflow

### Branches
- `master` - Production baseline (before refactoring)
- `refactor/phase-0-preparation` - **CURRENT** - E2E safety net
- `refactor/phase-1-type-safety` - Type safety improvements (next)
- `refactor/phase-2-architecture` - Component architecture (future)
- ... (see master plan for full list)

### Commit Strategy
- Granular commits per task (easy rollback)
- Conventional commit messages: `feat:`, `fix:`, `refactor:`, `test:`
- Each phase merge requires: ✅ Tests pass, ✅ QA baseline check

---

## Phase 0 Completion Checklist

### Remaining Tasks
- [ ] Fix E2E test selectors to match actual UI
- [ ] All critical path tests passing (dashboard, navigation, data-fetching)
- [ ] Run `pnpm qa:full` and save baseline
- [ ] Measure and document all baseline metrics
- [ ] Commit Phase 0 work with descriptive message
- [ ] Merge to master (or keep branch if iterating)

### Definition of Done
- ✅ E2E tests cover 3 critical paths (dashboard, navigation, data)
- ✅ All E2E tests pass (green baseline)
- ✅ QA baseline saved (for regression detection)
- ✅ Metrics documented (type safety, coverage, bundle size)
- ✅ Ready to start Phase 1 (type safety refactoring)

---

## Notes

**Why E2E tests are important:**
- Act as safety net during refactoring
- Catch regressions immediately
- Validate user-facing functionality
- More valuable than unit tests for refactoring (test behavior, not implementation)

**Current test status:**
- Most failing tests are due to generic selectors (expected)
- Need to inspect actual UI and update selectors
- Priority: Get critical user paths passing first
- Secondary: Add more edge case tests later

**Next session:**
1. Start dev server: `pnpm --filter kb-labs-studio-app dev`
2. Inspect UI elements in browser DevTools
3. Update test selectors in `tests/e2e/critical-paths/`
4. Run tests until passing: `pnpm test:e2e`
5. Move to QA baseline step

---

**End of Phase 0 Baseline Document**

/* ── Task Presets for Workflow Demo ─────────────────────────────── */

export type LineType = 'info' | 'success' | 'error' | 'warn' | 'code' | 'diff-add' | 'diff-del' | 'diff-file' | 'heading' | 'blank';

export interface OutputLine {
  text: string;
  type: LineType;
}

export interface StepOutput {
  lines: OutputLine[];
  approvalContext?: string;
  reworkLines?: OutputLine[];
  reworkApprovalContext?: string;
}

export interface TaskPreset {
  id: string;
  label: string;
  description: string;
  stepContent: Record<string, StepOutput>;
  stats: { filesChanged: number; commitsCreated: number };
}

/* ── Helper ── */
const L = (type: LineType, text: string): OutputLine => ({ text, type });
const blank = (): OutputLine => ({ text: '', type: 'blank' });

/* ═══════════════════════════════════════════════════════════════════
   Preset 1: Add user authentication
   ═══════════════════════════════════════════════════════════════════ */

const AUTH_PRESET: TaskPreset = {
  id: 'auth',
  label: 'Add user authentication',
  description: 'Add JWT-based authentication with login endpoint and middleware',
  stats: { filesChanged: 4, commitsCreated: 2 },
  stepContent: {
    /* ── Plan ── */
    plan: {
      lines: [
        L('info', '$ kb agent run --mode=plan --task="Add user authentication"'),
        L('info', 'Analyzing codebase...'),
        L('info', 'Found 3 relevant files via Mind RAG (confidence: 0.82)'),
        blank(),
        L('heading', '## Implementation Plan'),
        blank(),
        L('info', '1. Create auth middleware  →  src/middleware/auth.ts'),
        L('info', '2. Add login endpoint      →  src/routes/auth.ts'),
        L('info', '3. Add User model fields   →  src/models/user.ts'),
        L('info', '4. Update route registry   →  src/routes/index.ts'),
        blank(),
        L('success', 'Plan generated (4 steps, 4 files)'),
      ],
    },

    /* ── Plan Gate ── */
    'plan-gate': {
      lines: [
        L('info', 'Validating plan structure...'),
        L('success', '✓ Plan has clear steps'),
        L('success', '✓ All target files exist or can be created'),
        L('success', '✓ No circular dependencies detected'),
        L('success', 'Gate passed'),
      ],
    },

    /* ── Plan Approval ── */
    'plan-approval': {
      lines: [],
      approvalContext: '**Plan**: Create JWT auth middleware, add `/api/auth/login` endpoint, extend User model with `passwordHash` and `lastLogin` fields, register new routes.\n\n**Scope**: 4 files changed, 0 dependencies added.\n**Risk**: Low — isolated feature, no breaking changes.',
      reworkLines: [
        L('info', '$ kb agent run --mode=plan (incorporating feedback)'),
        L('info', 'Re-analyzing with additional requirements...'),
        blank(),
        L('heading', '## Implementation Plan (v2)'),
        blank(),
        L('info', '1. Create auth middleware    →  src/middleware/auth.ts'),
        L('info', '2. Add login endpoint        →  src/routes/auth.ts'),
        L('info', '3. Add User model fields     →  src/models/user.ts'),
        L('info', '4. Update route registry     →  src/routes/index.ts'),
        L('info', '5. Add rate limiting guard   →  src/middleware/rate-limit.ts'),
        L('info', '6. Write integration tests   →  tests/auth.test.ts'),
        blank(),
        L('success', 'Plan updated (6 steps, 6 files)'),
      ],
      reworkApprovalContext: '**Plan v2**: Added rate limiting middleware and integration tests per feedback.\n\n**Scope**: 6 files changed, +1 dependency (`express-rate-limit`).\n**Risk**: Low — rate limiter is well-tested, tests add safety net.',
    },

    /* ── Implement ── */
    implement: {
      lines: [
        L('info', '$ kb agent run --mode=execute'),
        L('info', 'Executing plan step 1/4...'),
        blank(),
        L('diff-file', '--- /dev/null'),
        L('diff-file', '+++ b/src/middleware/auth.ts'),
        L('diff-add', '+import jwt from "jsonwebtoken";'),
        L('diff-add', '+import { Request, Response, NextFunction } from "express";'),
        L('diff-add', '+'),
        L('diff-add', '+export function authMiddleware(req: Request, res: Response, next: NextFunction) {'),
        L('diff-add', '+  const token = req.headers.authorization?.split(" ")[1];'),
        L('diff-add', '+  if (!token) return res.status(401).json({ error: "No token" });'),
        L('diff-add', '+  try {'),
        L('diff-add', '+    req.user = jwt.verify(token, process.env.JWT_SECRET!);'),
        L('diff-add', '+    next();'),
        L('diff-add', '+  } catch { return res.status(401).json({ error: "Invalid token" }); }'),
        L('diff-add', '+}'),
        blank(),
        L('diff-file', '--- /dev/null'),
        L('diff-file', '+++ b/src/routes/auth.ts'),
        L('diff-add', '+import { Router } from "express";'),
        L('diff-add', '+import bcrypt from "bcrypt";'),
        L('diff-add', '+import jwt from "jsonwebtoken";'),
        L('diff-add', '+import { User } from "../models/user";'),
        L('diff-add', '+'),
        L('diff-add', '+const router = Router();'),
        L('diff-add', '+'),
        L('diff-add', '+router.post("/login", async (req, res) => {'),
        L('diff-add', '+  const { email, password } = req.body;'),
        L('diff-add', '+  const user = await User.findByEmail(email);'),
        L('diff-add', '+  if (!user || !await bcrypt.compare(password, user.passwordHash))'),
        L('diff-add', '+    return res.status(401).json({ error: "Invalid credentials" });'),
        L('diff-add', '+  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, { expiresIn: "24h" });'),
        L('diff-add', '+  res.json({ token, user: { id: user.id, email: user.email } });'),
        L('diff-add', '+});'),
        blank(),
        L('diff-file', '--- a/src/models/user.ts'),
        L('diff-file', '+++ b/src/models/user.ts'),
        L('info', '@@ -5,6 +5,8 @@ export interface User {'),
        L('info', '   id: string;'),
        L('info', '   email: string;'),
        L('info', '   name: string;'),
        L('diff-add', '+  passwordHash: string;'),
        L('diff-add', '+  lastLogin: Date | null;'),
        L('info', ' }'),
        blank(),
        L('success', '4 files changed, +87 lines, -0 lines'),
      ],
    },

    /* ── Changes Gate ── */
    'implement-gate': {
      lines: [
        L('info', 'Checking git diff...'),
        L('success', '✓ 4 files modified'),
        L('success', '✓ +87 -0 lines'),
        L('success', 'Gate passed — changes detected'),
      ],
    },

    /* ── Code Review ── */
    review: {
      lines: [
        L('info', '$ kb review:run --mode=full'),
        L('info', 'Running ESLint + LLM review...'),
        blank(),
        L('heading', '## Review Results'),
        blank(),
        L('warn', '⚠ MEDIUM  src/middleware/auth.ts:8'),
        L('info', '  JWT_SECRET should have a fallback for missing env var.'),
        L('info', '  Fix: Add validation at startup, not at request time.'),
        blank(),
        L('warn', '⚠ LOW     src/routes/auth.ts:12'),
        L('info', '  Consider adding input validation for email format.'),
        blank(),
        L('success', '✓ No security vulnerabilities'),
        L('success', '✓ No unused imports'),
        L('info', 'Review: 2 issues (0 blocker, 1 medium, 1 low)'),
      ],
    },

    /* ── Review Gate ── */
    'review-gate': {
      lines: [
        L('info', 'Evaluating review results...'),
        L('info', '0 blockers, 0 high → pass threshold met'),
        L('success', 'Gate passed — no blocking issues'),
      ],
    },

    /* ── Build & QA ── */
    qa: {
      lines: [
        L('info', '$ pnpm --filter @app/api run build'),
        L('info', 'Building TypeScript...'),
        L('success', '✓ Build passed (0 errors, 0 warnings)'),
        blank(),
        L('info', '$ pnpm --filter @app/api run typecheck'),
        L('success', '✓ Type check passed (0 errors)'),
        blank(),
        L('info', '$ pnpm --filter @app/api run test'),
        L('info', 'Running 24 tests...'),
        L('success', '✓ 24/24 tests passed'),
        blank(),
        L('success', 'QA passed — build clean, all tests green'),
      ],
    },

    /* ── QA Gate ── */
    'qa-gate': {
      lines: [
        L('info', 'Checking QA results...'),
        L('success', '✓ Build: passed'),
        L('success', '✓ Types: passed'),
        L('success', '✓ Tests: 24/24'),
        L('success', 'Gate passed'),
      ],
    },

    /* ── Result Approval ── */
    'result-approval': {
      lines: [],
      approvalContext: '**Summary**: Auth system implemented.\n\n- `src/middleware/auth.ts` — JWT verification middleware\n- `src/routes/auth.ts` — Login endpoint with bcrypt\n- `src/models/user.ts` — Added passwordHash, lastLogin\n- `src/routes/index.ts` — Registered auth routes\n\n**QA**: Build clean, 24/24 tests passed.\n**Review**: 2 non-blocking issues (medium + low).',
    },

    /* ── Commit ── */
    commit: {
      lines: [
        L('info', '$ kb commit commit --scope=@app/api'),
        L('info', 'Analyzing changes...'),
        blank(),
        L('heading', 'Generated commits:'),
        blank(),
        L('success', '[a3f8c21] feat(api): add JWT authentication middleware and login endpoint'),
        L('success', '[b7d2e45] feat(api): extend User model with passwordHash and lastLogin'),
        blank(),
        L('success', '2 commits applied'),
      ],
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════
   Preset 2: Fix performance bug
   ═══════════════════════════════════════════════════════════════════ */

const PERF_PRESET: TaskPreset = {
  id: 'perf',
  label: 'Fix performance bug #42',
  description: 'Optimize slow dashboard query causing 3s page loads',
  stats: { filesChanged: 2, commitsCreated: 1 },
  stepContent: {
    plan: {
      lines: [
        L('info', '$ kb agent run --mode=plan --task="Fix performance bug #42"'),
        L('info', 'Searching codebase for dashboard query...'),
        L('info', 'Found bottleneck via Mind RAG: src/queries/dashboard.ts:47'),
        blank(),
        L('heading', '## Implementation Plan'),
        blank(),
        L('info', '1. Add compound index       →  src/db/migrations/005.ts'),
        L('info', '2. Rewrite N+1 query        →  src/queries/dashboard.ts'),
        blank(),
        L('success', 'Plan generated (2 steps, 2 files)'),
      ],
    },
    'plan-gate': {
      lines: [
        L('info', 'Validating plan...'),
        L('success', '✓ Target files exist'),
        L('success', '✓ Migration sequence valid'),
        L('success', 'Gate passed'),
      ],
    },
    'plan-approval': {
      lines: [],
      approvalContext: '**Plan**: Fix N+1 query in dashboard loader. Add compound DB index on `(tenant_id, created_at)`. Rewrite to single JOIN query.\n\n**Expected impact**: 3s → ~200ms page load.\n**Risk**: Low — index is additive, query change is backward compatible.',
      reworkLines: [
        L('info', '$ kb agent run --mode=plan (incorporating feedback)'),
        blank(),
        L('heading', '## Implementation Plan (v2)'),
        blank(),
        L('info', '1. Add compound index       →  src/db/migrations/005.ts'),
        L('info', '2. Rewrite N+1 query        →  src/queries/dashboard.ts'),
        L('info', '3. Add query cache (60s TTL) →  src/queries/dashboard.ts'),
        blank(),
        L('success', 'Plan updated (3 steps, 2 files)'),
      ],
      reworkApprovalContext: '**Plan v2**: Added 60s TTL cache layer per feedback.\n\n**Expected impact**: 3s → ~50ms (cached), ~200ms (miss).\n**Risk**: Low — cache invalidates on write.',
    },
    implement: {
      lines: [
        L('info', '$ kb agent run --mode=execute'),
        blank(),
        L('diff-file', '--- /dev/null'),
        L('diff-file', '+++ b/src/db/migrations/005-dashboard-index.ts'),
        L('diff-add', '+export async function up(db: Database) {'),
        L('diff-add', '+  await db.exec(`'),
        L('diff-add', '+    CREATE INDEX idx_events_tenant_date'),
        L('diff-add', '+    ON events (tenant_id, created_at DESC)'),
        L('diff-add', '+  `);'),
        L('diff-add', '+}'),
        blank(),
        L('diff-file', '--- a/src/queries/dashboard.ts'),
        L('diff-file', '+++ b/src/queries/dashboard.ts'),
        L('info', '@@ -45,12 +45,8 @@ export async function loadDashboard(tenantId: string) {'),
        L('diff-del', '-  const users = await db.query("SELECT * FROM users WHERE tenant_id = ?", [tenantId]);'),
        L('diff-del', '-  for (const user of users) {'),
        L('diff-del', '-    user.events = await db.query("SELECT * FROM events WHERE user_id = ?", [user.id]);'),
        L('diff-del', '-  }'),
        L('diff-add', '+  const rows = await db.query(`'),
        L('diff-add', '+    SELECT u.*, e.type, e.created_at AS event_date'),
        L('diff-add', '+    FROM users u LEFT JOIN events e ON e.user_id = u.id'),
        L('diff-add', '+    WHERE u.tenant_id = ? ORDER BY e.created_at DESC'),
        L('diff-add', '+  `, [tenantId]);'),
        blank(),
        L('success', '2 files changed, +14 lines, -8 lines'),
      ],
    },
    'implement-gate': {
      lines: [
        L('info', 'Checking git diff...'),
        L('success', '✓ 2 files modified, +14 -8 lines'),
        L('success', 'Gate passed'),
      ],
    },
    review: {
      lines: [
        L('info', '$ kb review:run --mode=full'),
        blank(),
        L('heading', '## Review Results'),
        blank(),
        L('success', '✓ LGTM — no issues found'),
        L('success', '✓ N+1 eliminated correctly'),
        L('success', '✓ Index matches query pattern'),
        blank(),
        L('info', 'Suggestion: consider adding LIMIT clause for pagination.'),
        blank(),
        L('success', 'Review: 0 issues, 1 suggestion'),
      ],
    },
    'review-gate': {
      lines: [
        L('info', 'Evaluating review...'),
        L('success', 'Gate passed — LGTM'),
      ],
    },
    qa: {
      lines: [
        L('info', '$ pnpm run build && pnpm run test'),
        L('success', '✓ Build passed'),
        L('success', '✓ 18/18 tests passed'),
        blank(),
        L('info', 'Benchmark: dashboard query'),
        L('info', '  Before:  3,240ms avg'),
        L('info', '  After:     187ms avg'),
        L('success', '✓ 17x improvement'),
      ],
    },
    'qa-gate': {
      lines: [
        L('success', '✓ Build: passed'),
        L('success', '✓ Tests: 18/18'),
        L('success', '✓ Benchmark: 17x faster'),
        L('success', 'Gate passed'),
      ],
    },
    'result-approval': {
      lines: [],
      approvalContext: '**Summary**: N+1 query fixed.\n\n- Added compound index `(tenant_id, created_at)`\n- Rewrote to single JOIN query\n\n**Benchmark**: 3,240ms → 187ms (17x improvement)\n**Tests**: 18/18 passed.',
    },
    commit: {
      lines: [
        L('info', '$ kb commit commit --scope=@app/api'),
        blank(),
        L('success', '[c9a1b3f] fix(dashboard): replace N+1 query with JOIN and add compound index'),
        blank(),
        L('success', '1 commit applied'),
      ],
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════
   Preset 3: Refactor API
   ═══════════════════════════════════════════════════════════════════ */

const REFACTOR_PRESET: TaskPreset = {
  id: 'refactor',
  label: 'Refactor API to REST v2',
  description: 'Migrate API endpoints from v1 to v2 with versioned routing',
  stats: { filesChanged: 5, commitsCreated: 2 },
  stepContent: {
    plan: {
      lines: [
        L('info', '$ kb agent run --mode=plan --task="Refactor API to REST v2"'),
        L('info', 'Analyzing current API surface...'),
        L('info', 'Found 12 endpoints in src/routes/v1/'),
        blank(),
        L('heading', '## Implementation Plan'),
        blank(),
        L('info', '1. Create v2 router        →  src/routes/v2/index.ts'),
        L('info', '2. Migrate user endpoints   →  src/routes/v2/users.ts'),
        L('info', '3. Migrate project endpoints →  src/routes/v2/projects.ts'),
        L('info', '4. Add deprecation headers  →  src/middleware/deprecation.ts'),
        L('info', '5. Update API docs          →  docs/api-v2.md'),
        blank(),
        L('success', 'Plan generated (5 steps, 5 files)'),
      ],
    },
    'plan-gate': {
      lines: [
        L('info', 'Validating plan...'),
        L('success', '✓ All source files accessible'),
        L('success', '✓ No circular route dependencies'),
        L('success', 'Gate passed'),
      ],
    },
    'plan-approval': {
      lines: [],
      approvalContext: '**Plan**: Create `/api/v2/` router with new response format. Migrate all 12 endpoints. Add `Deprecation` header to v1 routes.\n\n**Scope**: 5 files, backward compatible — v1 routes stay active.\n**Risk**: Medium — wide surface area, needs thorough testing.',
      reworkLines: [
        L('info', '$ kb agent run --mode=plan (v2)'),
        blank(),
        L('heading', '## Implementation Plan (v2)'),
        blank(),
        L('info', '1. Create v2 router         →  src/routes/v2/index.ts'),
        L('info', '2. Migrate user endpoints    →  src/routes/v2/users.ts'),
        L('info', '3. Migrate project endpoints  →  src/routes/v2/projects.ts'),
        L('info', '4. Add deprecation middleware →  src/middleware/deprecation.ts'),
        L('info', '5. Add v1→v2 redirect option  →  src/middleware/version.ts'),
        L('info', '6. Update API docs           →  docs/api-v2.md'),
        blank(),
        L('success', 'Plan updated (6 steps, 6 files)'),
      ],
      reworkApprovalContext: '**Plan v2**: Added optional v1→v2 redirect middleware per feedback.\n\n**Scope**: 6 files, backward compatible + gradual migration path.\n**Risk**: Medium — mitigated by redirect fallback.',
    },
    implement: {
      lines: [
        L('info', '$ kb agent run --mode=execute'),
        blank(),
        L('diff-file', '--- /dev/null'),
        L('diff-file', '+++ b/src/routes/v2/index.ts'),
        L('diff-add', '+import { Router } from "express";'),
        L('diff-add', '+import { users } from "./users";'),
        L('diff-add', '+import { projects } from "./projects";'),
        L('diff-add', '+'),
        L('diff-add', '+export const v2Router = Router();'),
        L('diff-add', '+v2Router.use("/users", users);'),
        L('diff-add', '+v2Router.use("/projects", projects);'),
        blank(),
        L('diff-file', '--- /dev/null'),
        L('diff-file', '+++ b/src/routes/v2/users.ts'),
        L('diff-add', '+import { Router } from "express";'),
        L('diff-add', '+'),
        L('diff-add', '+export const users = Router();'),
        L('diff-add', '+'),
        L('diff-add', '+users.get("/", async (req, res) => {'),
        L('diff-add', '+  const data = await UserService.list(req.query);'),
        L('diff-add', '+  res.json({ data, meta: { version: "v2", total: data.length } });'),
        L('diff-add', '+});'),
        blank(),
        L('diff-file', '--- a/src/routes/v1/users.ts'),
        L('diff-file', '+++ b/src/routes/v1/users.ts'),
        L('info', '@@ -1,4 +1,5 @@'),
        L('diff-add', '+// @deprecated — use /api/v2/users'),
        L('info', ' import { Router } from "express";'),
        blank(),
        L('success', '5 files changed, +68 lines, -3 lines'),
      ],
    },
    'implement-gate': {
      lines: [
        L('success', '✓ 5 files modified, +68 -3 lines'),
        L('success', 'Gate passed'),
      ],
    },
    review: {
      lines: [
        L('info', '$ kb review:run --mode=full'),
        blank(),
        L('heading', '## Review Results'),
        blank(),
        L('success', '✓ Route structure is clean'),
        L('success', '✓ Response format consistent'),
        L('warn', '⚠ LOW  src/routes/v2/users.ts:7'),
        L('info', '  Missing pagination defaults for .list() call.'),
        blank(),
        L('success', 'Review: 1 low-severity issue'),
      ],
    },
    'review-gate': {
      lines: [
        L('info', 'Evaluating review...'),
        L('success', 'Gate passed — no blocking issues'),
      ],
    },
    qa: {
      lines: [
        L('info', '$ pnpm run build && pnpm run test'),
        L('success', '✓ Build passed (0 errors)'),
        blank(),
        L('info', 'Running 42 tests...'),
        L('success', '✓ 42/42 tests passed'),
        L('success', '✓ v1 endpoints still responding (backward compat)'),
        L('success', '✓ v2 endpoints returning new format'),
      ],
    },
    'qa-gate': {
      lines: [
        L('success', '✓ Build: passed'),
        L('success', '✓ Tests: 42/42'),
        L('success', '✓ Backward compat: verified'),
        L('success', 'Gate passed'),
      ],
    },
    'result-approval': {
      lines: [],
      approvalContext: '**Summary**: API v2 migration complete.\n\n- New v2 router with users + projects endpoints\n- Consistent response format: `{ data, meta }`\n- v1 routes marked deprecated (still functional)\n\n**Tests**: 42/42 passed, backward compat verified.',
    },
    commit: {
      lines: [
        L('info', '$ kb commit commit --scope=@app/api'),
        blank(),
        L('success', '[d4e7f92] refactor(api): create v2 router with versioned endpoints'),
        L('success', '[e8b3a16] chore(api): add deprecation headers to v1 routes'),
        blank(),
        L('success', '2 commits applied'),
      ],
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════
   Generic preset for custom input
   ═══════════════════════════════════════════════════════════════════ */

export function getGenericPreset(taskName: string): TaskPreset {
  const name = taskName || 'Implement feature';
  return {
    id: 'custom',
    label: name,
    description: name,
    stats: { filesChanged: 3, commitsCreated: 1 },
    stepContent: {
      plan: {
        lines: [
          L('info', `$ kb agent run --mode=plan --task="${name}"`),
          L('info', 'Analyzing codebase with Mind RAG...'),
          L('info', 'Found relevant context (confidence: 0.78)'),
          blank(),
          L('heading', '## Implementation Plan'),
          blank(),
          L('info', '1. Identify affected modules'),
          L('info', '2. Implement core changes'),
          L('info', '3. Update related tests'),
          blank(),
          L('success', 'Plan generated (3 steps)'),
        ],
      },
      'plan-gate': {
        lines: [
          L('success', '✓ Plan valid'),
          L('success', 'Gate passed'),
        ],
      },
      'plan-approval': {
        lines: [],
        approvalContext: `**Plan**: Implement "${name}".\n\n**Scope**: 3 files, estimated low-medium complexity.\n**Approach**: Analyze → implement → test.`,
        reworkLines: [
          L('info', '$ kb agent run --mode=plan (v2, with feedback)'),
          blank(),
          L('heading', '## Implementation Plan (v2)'),
          blank(),
          L('info', '1. Identify affected modules'),
          L('info', '2. Implement core changes'),
          L('info', '3. Add edge case handling'),
          L('info', '4. Update tests + docs'),
          blank(),
          L('success', 'Plan updated (4 steps)'),
        ],
        reworkApprovalContext: `**Plan v2**: Updated scope per feedback.\n\n**Scope**: 4 files.\n**Risk**: Low.`,
      },
      implement: {
        lines: [
          L('info', '$ kb agent run --mode=execute'),
          L('info', 'Implementing changes...'),
          blank(),
          L('diff-file', '--- a/src/feature.ts'),
          L('diff-file', '+++ b/src/feature.ts'),
          L('diff-add', '+// Implementation for: ' + name),
          L('diff-add', '+export function handler(input: Input): Output {'),
          L('diff-add', '+  const result = process(input);'),
          L('diff-add', '+  return { success: true, data: result };'),
          L('diff-add', '+}'),
          blank(),
          L('success', '3 files changed'),
        ],
      },
      'implement-gate': {
        lines: [
          L('success', '✓ Changes detected'),
          L('success', 'Gate passed'),
        ],
      },
      review: {
        lines: [
          L('info', '$ kb review:run --mode=full'),
          L('success', '✓ LGTM — no issues found'),
          L('success', 'Review: 0 issues'),
        ],
      },
      'review-gate': {
        lines: [
          L('success', 'Gate passed — LGTM'),
        ],
      },
      qa: {
        lines: [
          L('info', '$ pnpm run build && pnpm run test'),
          L('success', '✓ Build passed'),
          L('success', '✓ All tests passed'),
        ],
      },
      'qa-gate': {
        lines: [
          L('success', '✓ Build + tests green'),
          L('success', 'Gate passed'),
        ],
      },
      'result-approval': {
        lines: [],
        approvalContext: `**Summary**: "${name}" implemented.\n\n- 3 files changed\n- Build clean, tests passing\n- No review issues.`,
      },
      commit: {
        lines: [
          L('info', '$ kb commit commit'),
          blank(),
          L('success', `[f1a2b3c] feat: ${name.toLowerCase()}`),
          blank(),
          L('success', '1 commit applied'),
        ],
      },
    },
  };
}

/* ── Exports ── */

export const TASK_PRESETS: TaskPreset[] = [AUTH_PRESET, PERF_PRESET, REFACTOR_PRESET];

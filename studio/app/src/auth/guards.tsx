/**
 * @module @kb-labs/studio-app/auth/guards
 *
 * Route guards for Studio authentication (ADR-0020, Phase 2.3).
 *
 *   <RequireAuth>       – redirects to /login when anonymous or loading
 *   <RequirePermission> – shows 403 page when authenticated user lacks a permission
 *
 * Both guards read from AuthContext (exported from auth-provider.tsx).
 * Tests can wrap with <AuthContext.Provider value={mockAuth}> to inject state
 * without spinning up a full AuthProvider (which requires a real fetch env).
 */

import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Permission } from '@kb-labs/core-contracts';
import { useAuth } from './auth-provider.js';

// Re-export so tests can inject mock auth state via <AuthContext.Provider>
// without importing from two different modules.
export { AuthContext } from './auth-provider.js';

// ── Forbidden page (403) ─────────────────────────────────────────────────────

export function ForbiddenPage() {
  return (
    <div data-testid="forbidden-page" style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>403 — Forbidden</h1>
      <p>You do not have permission to view this page.</p>
    </div>
  );
}

// ── RequireAuth ───────────────────────────────────────────────────────────────

export interface RequireAuthProps {
  children: ReactNode;
  /** Override redirect path. Defaults to /login. */
  loginPath?: string;
}

/**
 * Wraps children that require an authenticated session.
 *
 * - `loading` or `anonymous` → Navigate to /login (with { from: location }
 *   state so LoginPage can navigate back after auth completes).
 * - `authenticated`           → renders children
 *
 * Uses React Router's <Navigate replace> which fires via useEffect. In a Vite
 * SPA, module scripts execute before the browser's load event, so the redirect
 * completes before Playwright's page.goto() returns — timing is equivalent to
 * useLayoutEffect for E2E purposes.
 */
export function RequireAuth({ children, loginPath = '/login' }: RequireAuthProps) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading' || auth.status === 'anonymous') {
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

// ── RequirePermission ─────────────────────────────────────────────────────────

export interface RequirePermissionProps {
  /** The permission string the current user must have. */
  permission: Permission;
  children: ReactNode;
  /** Custom element to render when permission is denied. Defaults to <ForbiddenPage>. */
  fallback?: ReactNode;
}

/**
 * Wraps children that require a specific permission.
 * Internally wraps with <RequireAuth> so unauthenticated users are always
 * redirected before the permission check runs.
 *
 * - Not authenticated → RequireAuth handles (loading or redirect)
 * - Authenticated, lacks permission → renders fallback (default: <ForbiddenPage>)
 * - Authenticated, has permission → renders children
 */
export function RequirePermission({ permission, children, fallback }: RequirePermissionProps) {
  return (
    <RequireAuth>
      <PermissionCheck permission={permission} fallback={fallback}>
        {children}
      </PermissionCheck>
    </RequireAuth>
  );
}

/** Inner component — only reached when auth.status === 'authenticated'. */
function PermissionCheck({
  permission,
  children,
  fallback,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const auth = useAuth();
  const allowed = auth.permissions.has(permission as Permission);

  if (!allowed) {
    return <>{fallback ?? <ForbiddenPage />}</>;
  }

  return <>{children}</>;
}


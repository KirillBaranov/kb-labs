/**
 * @module @kb-labs/studio-app/auth/auth-provider
 *
 * Real auth provider for Studio (ADR-0020, Phase 2.2).
 *
 * Replaces the old fake role-select provider that stored state in
 * localStorage. State now comes from the server via cookie-based sessions.
 *
 * State machine:
 *   loading → authenticated  (GET /api/auth/me succeeds)
 *   loading → anonymous      (GET /api/auth/me returns non-2xx)
 *   authenticated → anonymous (logout() or auth:unauthenticated event)
 *   anonymous → authenticated (login() succeeds)
 *
 * The `auth:unauthenticated` CustomEvent is dispatched by the HTTP client
 * when a token refresh fails — any window listener transitions to anonymous.
 *
 * Permissions are loaded alongside /api/auth/me and stored as a Set for
 * O(1) `has()` lookups in `useCan()`.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { Permission } from '@kb-labs/core-contracts';

// ── Public user type (no role field — CD-3) ───────────────────────────────────

export interface PublicUser {
  userId: string;
  email: string;
  tenantId: string;
}

// ── Auth state ────────────────────────────────────────────────────────────────

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface LoadingState {
  status: 'loading';
  user?: undefined;
  permissions: Set<Permission>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

interface AuthenticatedState {
  status: 'authenticated';
  user: PublicUser;
  permissions: Set<Permission>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

interface AnonymousState {
  status: 'anonymous';
  user?: undefined;
  permissions: Set<Permission>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export type AuthState = LoadingState | AuthenticatedState | AnonymousState;

// ── Context ───────────────────────────────────────────────────────────────────

// Exported so guards and tests can inject a mock auth state without spinning
// up the full AuthProvider (which requires a real fetch environment).
export const AuthContext = createContext<AuthState | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export interface AuthProviderProps {
  children: ReactNode;
  /** Override fetch for testing. Defaults to globalThis.fetch. */
  _fetch?: typeof fetch;
}

export function AuthProvider({ children, _fetch }: AuthProviderProps) {
  // Stable reference that always delegates to the current globalThis.fetch at call
  // time, so vi.stubGlobal replacements in tests take effect without requiring a
  // re-render. useMemo keeps the reference identity stable across re-renders so
  // useEffect / useCallback deps that include fetchFn don't fire spuriously.
  const fetchFn = useMemo<typeof fetch>(
    () => _fetch ?? ((...args) => globalThis.fetch(...args)),
    [_fetch],
  );

  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PublicUser | undefined>(undefined);
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set());

  // ── Helpers ──────────────────────────────────────────────────────────────

  const goAnonymous = useCallback(() => {
    setStatus('anonymous');
    setUser(undefined);
    setPermissions(new Set());
  }, []);

  const loadPermissions = useCallback(async (): Promise<Set<Permission>> => {
    try {
      const res = await fetchFn('/api/auth/permissions', { credentials: 'include' });
      if (!res.ok) return new Set();
      const data = (await res.json()) as { permissions?: string[] };
      return new Set((data.permissions ?? []) as Permission[]);
    } catch {
      return new Set();
    }
  }, [fetchFn]);

  // ── Mount: check session ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetchFn('/api/auth/me', { credentials: 'include' });
        if (cancelled) return;

        if (!res.ok) {
          goAnonymous();
          return;
        }

        const userData = (await res.json()) as PublicUser;
        if (cancelled) return;

        const perms = await loadPermissions();
        if (cancelled) return;

        setUser(userData);
        setPermissions(perms);
        setStatus('authenticated');
      } catch {
        if (!cancelled) goAnonymous();
      }
    })();

    return () => { cancelled = true; };
  }, [fetchFn, goAnonymous, loadPermissions]);

  // ── auth:unauthenticated event ────────────────────────────────────────────

  useEffect(() => {
    const handler = () => goAnonymous();
    window.addEventListener('auth:unauthenticated', handler);
    return () => window.removeEventListener('auth:unauthenticated', handler);
  }, [goAnonymous]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const res = await fetchFn('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw Object.assign(
          new Error(body.error ?? 'Login failed'),
          { status: res.status },
        );
      }

      const userData = (await res.json()) as PublicUser;
      const perms = await loadPermissions();

      setUser(userData);
      setPermissions(perms);
      setStatus('authenticated');
    },
    [fetchFn, loadPermissions],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetchFn('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      goAnonymous();
    }
  }, [fetchFn, goAnonymous]);

  // ── Render ────────────────────────────────────────────────────────────────

  const value: AuthState =
    status === 'authenticated' && user
      ? { status, user, permissions, login, logout }
      : status === 'loading'
        ? { status: 'loading', permissions, login, logout }
        : { status: 'anonymous', permissions, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Returns true if the current user has the given permission. */
export function useCan(permission: Permission): boolean {
  const { permissions } = useAuth();
  return permissions.has(permission);
}

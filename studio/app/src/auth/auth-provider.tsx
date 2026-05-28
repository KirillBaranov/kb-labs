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
  useRef,
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
  /** Override cookie reader for testing. Defaults to document.cookie. */
  _getCookie?: (name: string) => string | undefined;
}

function defaultGetCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]!) : undefined;
}

export function AuthProvider({ children, _fetch, _getCookie }: AuthProviderProps) {
  const getCookie = useMemo(
    () => _getCookie ?? defaultGetCookie,
    [_getCookie],
  );
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

  // Ref that always holds the current status so the unauthenticated event
  // handler can read it without a stale closure (no goAnonymous if loading).
  const statusRef = useRef<AuthStatus>('loading');
  useEffect(() => { statusRef.current = status; }, [status]);

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
        let res = await fetchFn('/api/auth/me', { credentials: 'include' });
        if (cancelled) return;

        // If the access token has expired (401), attempt a transparent refresh
        // before giving up. This handles the case where the SPA is loaded fresh
        // after the access TTL elapsed (e.g. returning to a tab after 15 min).
        if (res.status === 401) {
          const refreshRes = await fetchFn('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include',
          });
          if (cancelled) return;

          if (!refreshRes.ok) {
            goAnonymous();
            return;
          }

          // Retry /api/auth/me with the newly-issued access cookie.
          res = await fetchFn('/api/auth/me', { credentials: 'include' });
          if (cancelled) return;
        }

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
  // Guard: ignore the event while the initial session check is still in flight.
  // If the event arrives during loading and we go anonymous immediately,
  // RequireAuth redirects to /login before the mount fetch resolves. The mount
  // check is the authoritative source of truth for initial auth state.

  useEffect(() => {
    const handler = () => {
      if (statusRef.current === 'loading') return;
      goAnonymous();
    };
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
    // Logout is a mutating endpoint protected by CSRF (double-submit pattern).
    const csrfToken = getCookie('kb_csrf');
    try {
      await fetchFn('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      });
    } finally {
      goAnonymous();
    }
  }, [fetchFn, getCookie, goAnonymous]);

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

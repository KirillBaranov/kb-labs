/**
 * Site analytics backed by KBPlatform SDK.
 *
 * Auth flow (browser-safe, localStorage-persisted):
 *   First visit  → POST /auth/register → POST /auth/token → KBPlatform instance
 *   Next visits  → load creds from localStorage → POST /auth/token → KBPlatform instance
 *
 * All tracking is fire-and-forget. Errors are silently dropped so analytics
 * never affects page rendering.
 *
 * Consent is checked on every call via localStorage key `cookie-consent`.
 * CookieBanner dispatches CONSENT_EVENT so the Analytics component can react
 * immediately when the user accepts, without polling.
 */

import { KBPlatform, type TelemetryEvent } from '@kb-labs/sdk/platform';

const GATEWAY = 'https://api.kblabs.ru';
const CREDS_KEY = 'kb_analytics';

/** Dispatched by CookieBanner when the user accepts or declines. */
export const CONSENT_EVENT = 'kb:consent';

export type Tags = Record<string, string | undefined>;

// ── types ─────────────────────────────────────────────────────────────────

interface StoredCredentials {
  deviceId: string;
  clientId: string;
  clientSecret: string;
}

// ── module singleton ───────────────────────────────────────────────────────
// One KBPlatform instance per page lifetime. Created lazily on first track()
// call after consent is given.

let _initPromise: Promise<KBPlatform | null> | null = null;

// ── consent ───────────────────────────────────────────────────────────────

export function isConsentGiven(): boolean {
  try {
    return localStorage.getItem('cookie-consent') === 'accepted';
  } catch {
    return false;
  }
}

// ── credentials ───────────────────────────────────────────────────────────

function loadCredentials(): StoredCredentials | null {
  try {
    return JSON.parse(localStorage.getItem(CREDS_KEY) ?? 'null') as StoredCredentials | null;
  } catch {
    return null;
  }
}

function saveCredentials(creds: StoredCredentials): void {
  try {
    localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
  } catch {}
}

function generateDeviceId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── auth ──────────────────────────────────────────────────────────────────

async function register(deviceId: string): Promise<{ clientId: string; clientSecret: string }> {
  const res = await fetch(`${GATEWAY}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `kb-site:${deviceId.slice(0, 8)}`,
      namespaceId: 'analytics',
      capabilities: [],
    }),
  });
  if (!res.ok) throw new Error(`register: HTTP ${res.status}`);
  return res.json() as Promise<{ clientId: string; clientSecret: string }>;
}

async function fetchToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${GATEWAY}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!res.ok) throw new Error(`token: HTTP ${res.status}`);
  const data = (await res.json()) as { accessToken: string };
  return data.accessToken;
}

// ── platform init ─────────────────────────────────────────────────────────

/**
 * Returns a ready KBPlatform instance (registering + obtaining a token if
 * needed). Cached for the page lifetime. Returns null on any failure so
 * callers can silently skip tracking.
 */
export function getPlatform(): Promise<KBPlatform | null> {
  if (_initPromise) return _initPromise;

  _initPromise = (async (): Promise<KBPlatform | null> => {
    try {
      let creds = loadCredentials();

      if (!creds) {
        const deviceId = generateDeviceId();
        const { clientId, clientSecret } = await register(deviceId);
        creds = { deviceId, clientId, clientSecret };
        saveCredentials(creds);
      }

      const token = await fetchToken(creds.clientId, creds.clientSecret);

      return new KBPlatform({
        endpoint: GATEWAY,
        apiKey: token,
        defaultTags: {
          source: 'kb-site',
          deviceId: creds.deviceId,
        },
        onError: () => {}, // silent — analytics must never surface errors
      });
    } catch {
      _initPromise = null; // allow retry on next call
      return null;
    }
  })();

  return _initPromise;
}

/** Call on page unload to flush buffered telemetry events. */
export async function flushAnalytics(): Promise<void> {
  const platform = await _initPromise?.catch(() => null);
  if (platform) await platform.telemetry.flush().catch(() => {});
}

// ── core track ────────────────────────────────────────────────────────────

/** Fire-and-forget. Drops silently when consent is not given or network fails. */
export function track(type: string, tags: Tags = {}): void {
  if (!isConsentGiven()) return;

  void getPlatform().then((platform) => {
    if (!platform) return;

    const cleanTags: Record<string, string> = {};
    for (const [k, v] of Object.entries(tags)) {
      if (v !== undefined) cleanTags[k] = v;
    }

    const event: TelemetryEvent = {
      source: 'kb-site',
      type,
      timestamp: new Date().toISOString(),
      tags: cleanTags,
    };

    platform.telemetry.event(type, undefined, event.tags);
  });
}

// ── utm helpers ───────────────────────────────────────────────────────────

export function utmTags(): Tags {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.search);
  const utm: Tags = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const val = p.get(key);
    if (val) utm[key] = val;
  }
  return utm;
}

// ── typed event helpers ───────────────────────────────────────────────────

export function trackPageView(path: string, locale: string): void {
  track('page_view', {
    path,
    locale,
    referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
    ...utmTags(),
  });
}

export function trackInstallCopy(command: string): void {
  track('install_cta_copy', { command: command.slice(0, 120) });
}

export function trackInstallClick(href: string): void {
  track('install_cta_click', { href });
}

export function trackOutbound(href: string, label?: string): void {
  track('outbound_click', { href, label });
}

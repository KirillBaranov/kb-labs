/**
 * Docs analytics backed by KBPlatform SDK.
 * No consent gate — only anonymous path data and explicit user feedback.
 */

import { KBPlatform } from '@kb-labs/sdk/platform';

const GATEWAY = 'https://api.kblabs.ru';
const CREDS_KEY = 'kb_docs_analytics';

type Tags = Record<string, string | undefined>;

interface StoredCredentials {
  deviceId: string;
  clientId: string;
  clientSecret: string;
}

let _initPromise: Promise<KBPlatform | null> | null = null;

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

async function register(deviceId: string): Promise<{ clientId: string; clientSecret: string }> {
  const res = await fetch(`${GATEWAY}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `kb-docs:${deviceId.slice(0, 8)}`,
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
        defaultTags: { source: 'kb-docs', deviceId: creds.deviceId },
        onError: () => {},
      });
    } catch {
      _initPromise = null;
      return null;
    }
  })();

  return _initPromise;
}

export async function flushAnalytics(): Promise<void> {
  const platform = await _initPromise?.catch(() => null);
  if (platform) await platform.telemetry.flush().catch(() => {});
}

export function track(type: string, tags: Tags = {}): void {
  void getPlatform().then((platform) => {
    if (!platform) return;
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(tags)) {
      if (v !== undefined) clean[k] = v;
    }
    platform.telemetry.event(type, undefined, clean);
  });
}

export function trackPageView(path: string): void {
  track('page_view', {
    path,
    referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
  });
}

export function trackDocFeedback(path: string, useful: boolean): void {
  track('doc_feedback', { path, useful: String(useful) });
}

export function trackOutbound(href: string, label?: string): void {
  track('outbound_click', { href, label });
}

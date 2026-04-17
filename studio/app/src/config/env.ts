type StudioEnv = Record<string, string | undefined>;

declare global {
  interface Window {
    __KB_STUDIO_CONFIG__?: StudioEnv;
  }
}

export function getStudioEnv(): StudioEnv {
  // Runtime config injected by server.js takes precedence over build-time env.
  // This allows the same SPA bundle to work in any environment (local, cloud, etc.)
  // without rebuilding — just set KB_API_BASE_URL env var on the Studio process.
  if (typeof window !== 'undefined' && window.__KB_STUDIO_CONFIG__) {
    return window.__KB_STUDIO_CONFIG__;
  }
  return ((import.meta as ImportMeta & { env?: StudioEnv }).env) ?? {};
}

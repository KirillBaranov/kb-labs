/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

interface ImportMetaEnv {
  readonly KB_API_BASE_URL?: string;
  readonly KB_GATEWAY_TOKEN?: string;
  readonly KB_DATA_SOURCE_MODE?: string;
  readonly KB_EVENTS_BASE_URL?: string;
  readonly KB_EVENTS_REGISTRY_PATH?: string;
  readonly KB_EVENTS_AUTH_TOKEN?: string;
  readonly KB_EVENTS_HEADERS?: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * @module @kb-labs/sdk/studio
 *
 * Studio SDK — single import for plugin page authors.
 * Re-exports hooks, UIKit components, and types from studio packages.
 *
 * @example
 * ```tsx
 * import { useData, usePermissions, useNotification, Table, Button, PageLayout } from '@kb-labs/sdk/studio';
 * ```
 */

// ─── Hooks ──────────────────────────────────────────────────────────

export {
  usePage,
  useEventBus,
  useData,
  useMutateData,
  useSSE,
  useInfiniteData,
  useWebSocket,
  usePermissions,
  useNavigation,
  useNotification,
  useTheme,
} from '@kb-labs/studio-hooks';

export type {
  PageContext,
  UseEventBusReturn,
  UseDataOptions,
  UseDataReturn,
  UseMutateDataReturn,
  UseSSEOptions,
  UseSSEReturn,
  UseInfiniteDataOptions,
  UseInfiniteDataReturn,
  UseWebSocketOptions,
  UseWebSocketReturn,
  WebSocketStatus,
  UsePermissionsReturn,
  UseNavigationReturn,
  UseNotificationReturn,
  UseThemeReturn,
  SemanticTokens,
  NotificationType,
} from '@kb-labs/studio-hooks';

// ─── Design tokens ──────────────────────────────────────────────────

export {
  colors,
  spacing,
  typography,
  radius,
  shadows,
  lightTheme,
  darkTheme,
  lightSemanticColors,
  darkSemanticColors,
} from '@kb-labs/studio-ui-core';

// ─── EventBus types ─────────────────────────────────────────────────

export type { EventMeta, EventHandler } from '@kb-labs/studio-event-bus';

// ─── UIKit components ───────────────────────────────────────────────

export * from '@kb-labs/studio-ui-kit';

// ─── DevTools (for plugin developers) ───────────────────────────────

export { devToolsStore, GenericChannel } from '@kb-labs/studio-devtools';
export type { DevToolsChannel, DevToolsPlugin, MFEvent, EventBusEvent } from '@kb-labs/studio-devtools';

// ─── Manifest types ─────────────────────────────────────────────────

export type {
  StudioConfig,
  StudioPageEntry,
  StudioMenuEntry,
} from '@kb-labs/plugin-contracts';

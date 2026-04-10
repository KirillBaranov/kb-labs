# Notification System

## Overview

The notification system tracks critical logs (warn/error) from the SSE stream and displays them in a bell icon in the header.

## Architecture

### Components

1. **`useNotifications` hook** (`@kb-labs/studio-data-client`)
   - Subscribes to observability SSE stream
   - Filters warn/error logs
   - Maintains notification state (read/unread)
   - Max 50 notifications by default

2. **`KBNotificationBell` component** (`@kb-labs/studio-ui-react`)
   - Bell icon with unread badge
   - Dropdown with notification list
   - Actions: mark as read, clear individual/all

3. **Integration in `router.tsx`** (`apps/studio`)
   - Uses `useNotifications` hook
   - Passes notifications to header via `KBPageLayout`

## Usage

### In Application (already integrated)

The notification system is automatically active when:
- SSE connection is established
- Warn/error logs are emitted from backend

### Manual Integration (for new apps)

```tsx
import { useNotifications } from '@kb-labs/studio-data-client';
import { KBNotificationBell } from '@kb-labs/studio-ui-react';

function MyApp() {
  const sources = useDataSources();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
    clearNotification,
  } = useNotifications(sources.observability);

  return (
    <KBNotificationBell
      notifications={notifications}
      unreadCount={unreadCount}
      onMarkAsRead={markAsRead}
      onMarkAllAsRead={markAllAsRead}
      onClearAll={clearAll}
      onClearNotification={clearNotification}
    />
  );
}
```

## Features

### Notification Types

Only critical logs are tracked:
- ⚠️ **Warnings** (level: `warn`)
- ❌ **Errors** (level: `error`)

### Notification Data

Each notification includes:
- `id` - unique identifier
- `timestamp` - ISO 8601 timestamp
- `level` - warn | error
- `message` - log message
- `plugin` - plugin ID (optional)
- `executionId` - execution ID (optional)
- `error` - error details (name, message)
- `read` - read/unread status

### User Actions

1. **Mark as read** - Click notification to mark as read
2. **Mark all as read** - Button in header
3. **Clear notification** - Remove individual notification
4. **Clear all** - Remove all notifications
5. **View all logs** - Navigate to `/observability/logs`

### UI/UX

- Badge shows unread count
- Red badge color for critical notifications
- Unread notifications have highlighted background
- Relative timestamps ("2m ago", "1h ago", "3d ago")
- Notifications auto-scroll
- Max 500 logs in SSE buffer (enforced by hook)
- Max 50 notifications shown (configurable)

## Error Handling

The notification system includes robust error handling for malformed log data:

1. **Safe message extraction** - Handles non-string messages by converting to JSON
2. **Safe error extraction** - Explicitly converts error name/message to strings
3. **Type checking in UI** - Component validates error object before rendering
4. **Fallback values** - Provides "No message" and "Unknown error" defaults

This prevents React rendering errors when backend sends unexpected data structures.

## Implementation Details

### Hook: `useNotifications`

```typescript
export function useNotifications(
  source: ObservabilityDataSource,
  maxNotifications: number = 50
): UseNotificationsResult
```

**Parameters:**
- `source` - Observability data source (SSE connection)
- `maxNotifications` - Max notifications to keep (default: 50)

**Returns:**
- `notifications` - Array of notifications
- `unreadCount` - Number of unread notifications
- `markAsRead(id)` - Mark single notification as read
- `markAllAsRead()` - Mark all as read
- `clearAll()` - Clear all notifications
- `clearNotification(id)` - Clear single notification

**Behavior:**
- Subscribes to SSE on mount
- Filters only warn/error logs
- Auto-generates unique notification ID
- Maintains FIFO buffer (oldest removed when limit reached)
- Cleans up SSE connection on unmount

### Component: `KBNotificationBell`

```typescript
export interface KBNotificationBellProps {
  notifications: LogNotification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onClearNotification: (id: string) => void;
}
```

**Features:**
- Bell icon with badge (lucide-react `Bell`)
- Dropdown with 400px width, max 500px height
- Auto-scrollable list
- Hover effects on notifications
- Empty state when no notifications

## Testing

### Manual Testing

1. **Trigger warn log:**
   ```bash
   # From backend, emit a warn log
   curl -X POST http://localhost:5050/api/v1/test/log \
     -H "Content-Type: application/json" \
     -d '{"level": "warn", "message": "Test warning"}'
   ```

2. **Trigger error log:**
   ```bash
   curl -X POST http://localhost:5050/api/v1/test/log \
     -H "Content-Type: application/json" \
     -d '{"level": "error", "message": "Test error", "error": {"name": "TestError", "message": "Something went wrong"}}'
   ```

3. **Verify:**
   - Bell icon shows badge with count
   - Click bell to see notifications
   - Click notification to mark as read
   - Clear individual/all notifications

## Future Enhancements

- [ ] **Persistent storage** - Save notifications to localStorage
- [ ] **Sound/desktop notifications** - Browser notifications API
- [ ] **Filtering** - Filter by plugin, level, time range
- [ ] **Grouping** - Group by plugin or execution ID
- [ ] **Search** - Search within notifications
- [ ] **Export** - Export notifications as JSON/CSV
- [ ] **Auto-dismiss** - Auto-clear old notifications after N days
- [ ] **Preferences** - User settings for notification behavior

## Files Modified/Created

### Created
- `kb-labs-studio/packages/studio-data-client/src/hooks/use-notifications.ts`
- `kb-labs-studio/packages/studio-ui-react/src/components/kb-notification-bell.tsx`
- `kb-labs-studio/docs/NOTIFICATION_SYSTEM.md`

### Modified
- `kb-labs-studio/packages/studio-data-client/src/index.ts` (export hook)
- `kb-labs-studio/packages/studio-ui-react/src/index.ts` (export component)
- `kb-labs-studio/packages/studio-ui-react/src/components/kb-header.tsx` (add notification props)
- `kb-labs-studio/apps/studio/src/router.tsx` (integrate notifications)

## Dependencies

- `@kb-labs/studio-data-client` - SSE observability source
- `@kb-labs/studio-ui-react` - UI components
- `antd` - Ant Design components (Badge, Dropdown, List, etc.)
- `lucide-react` - Icons (Bell, AlertTriangle, XCircle, etc.)
- `react` - React framework

## Related Documentation

- [Live Logs Implementation Plan](./LIVE_LOGS_IMPLEMENTATION_PLAN.md)
- [Observability SSE API](../kb-labs-rest-api/docs/api-observability.md)
- [Studio Data Client](../packages/studio-data-client/README.md)
- [Studio UI React](../packages/studio-ui-react/README.md)

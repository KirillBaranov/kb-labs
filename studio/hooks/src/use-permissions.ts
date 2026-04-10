import { useCallback } from 'react';
import { usePageContext } from './page-context.js';

export interface UsePermissionsReturn {
  /** Check if the current user has a specific permission */
  hasPermission: (permission: string) => boolean;
  /** All permissions available to this page */
  permissions: string[];
}

/**
 * Atomic permission checks inside a page.
 * Page-level permissions are enforced by the host before loading.
 * This hook is for fine-grained control within the page.
 *
 * @example
 * ```tsx
 * const { hasPermission } = usePermissions();
 * if (!hasPermission('commit:write')) return <ReadOnlyView />;
 * ```
 */
export function usePermissions(): UsePermissionsReturn {
  const { permissions } = usePageContext();

  const hasPermission = useCallback(
    (permission: string) => permissions.includes(permission),
    [permissions],
  );

  return { hasPermission, permissions };
}

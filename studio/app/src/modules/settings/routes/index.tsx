/**
 * @module @kb-labs/studio-app/modules/settings/routes
 * Settings module routing configuration
 */

import type { RouteObject } from 'react-router-dom';
import { SettingsPage } from '../pages/settings-page';
import { ErrorBoundary } from '../../../components/error-boundary';
import { renderIcon } from '../../../routes/helpers';
import type { NavigationItem } from '@/components/ui';

// Route paths
const PATHS = {
  ROOT: '/settings',
  TAB: '/settings/:tab',
} as const;

// Route keys
const KEYS = {
  MODULE: 'settings',
} as const;

/**
 * Settings routes
 */
export const settingsRoutes: RouteObject[] = [
  {
    path: PATHS.ROOT,
    element: <SettingsPage />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: PATHS.TAB,
    element: <SettingsPage />,
    errorElement: <ErrorBoundary />,
  },
];

/**
 * Settings navigation item for sidebar
 */
export const settingsNavigation: NavigationItem = {
  key: KEYS.MODULE,
  label: 'Settings',
  icon: renderIcon('SettingOutlined'),
  path: PATHS.ROOT,
};

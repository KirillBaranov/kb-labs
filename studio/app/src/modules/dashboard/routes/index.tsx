/**
 * @module @kb-labs/studio-app/modules/dashboard/routes
 * Dashboard module routing configuration
 */

import type { RouteObject } from 'react-router-dom';
import { DashboardPage } from '../pages/dashboard-page';
import { AIInsightsPage } from '../pages/ai-insights-page';
import { DashboardLayout } from '../layouts/dashboard-layout';
import { ErrorBoundary } from '../../../components/error-boundary';
import { renderIcon } from '../../../routes/helpers';
import type { NavigationItem } from '@/components/ui';

// Route paths
const PATHS = {
  ROOT: '/',
  INSIGHTS: '/insights',
} as const;

// Route keys
const KEYS = {
  MODULE: 'dashboard',
  OVERVIEW: 'dashboard-overview',
  INSIGHTS: 'dashboard-insights',
} as const;

/**
 * Dashboard routes
 */
export const dashboardRoutes: RouteObject[] = [
  {
    path: PATHS.ROOT,
    element: <DashboardLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
    ],
  },
  {
    path: PATHS.INSIGHTS,
    element: <AIInsightsPage />,
    errorElement: <ErrorBoundary />,
  },
];

/**
 * Dashboard navigation items for sidebar
 */
export const dashboardNavigation: NavigationItem = {
  key: KEYS.MODULE,
  label: 'Dashboard',
  icon: renderIcon('DashboardOutlined'),
  children: [
    {
      key: KEYS.OVERVIEW,
      label: 'Overview',
      path: PATHS.ROOT,
      icon: renderIcon('DashboardOutlined'),
    },
    {
      key: KEYS.INSIGHTS,
      label: 'AI Insights',
      path: PATHS.INSIGHTS,
      icon: renderIcon('RobotOutlined'),
    },
  ],
};

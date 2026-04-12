/**
 * @module @kb-labs/studio-app/modules/observability/routes
 * Observability module routing configuration
 */

import type { RouteObject } from 'react-router-dom';
import { StateBrokerPage } from '../pages/state-broker-page';
import { PrometheusMetricsPage } from '../pages/prometheus-metrics-page';
import { SystemEventsPage } from '../pages/system-events-page';
import { LogsPage } from '../pages/logs-page';
import { LogDetailPage } from '../pages/log-detail-page';
import { ErrorBoundary } from '../../../components/error-boundary';
import { renderIcon } from '../../../routes/helpers';
import type { NavigationItem } from '@/components/ui';

// Route paths
const PATHS = {
  STATE_BROKER: '/observability/state-broker',
  PROMETHEUS: '/observability/prometheus-metrics',
  EVENTS: '/observability/system-events',
  LOGS: '/observability/logs',
  LOG_DETAIL: '/observability/logs/:id',
} as const;

// Route keys
const KEYS = {
  MODULE: 'observability',
  STATE_BROKER: 'observability-state-broker',
  PROMETHEUS: 'observability-prometheus',
  EVENTS: 'observability-events',
  LOGS: 'observability-logs',
} as const;

/**
 * Observability routes
 */
export const observabilityRoutes: RouteObject[] = [
  {
    path: PATHS.STATE_BROKER,
    element: <StateBrokerPage />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: PATHS.PROMETHEUS,
    element: <PrometheusMetricsPage />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: PATHS.EVENTS,
    element: <SystemEventsPage />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: PATHS.LOGS,
    element: <LogsPage />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: PATHS.LOG_DETAIL,
    element: <LogDetailPage />,
    errorElement: <ErrorBoundary />,
  },
];

/**
 * Observability navigation item for sidebar
 */
export const observabilityNavigation: NavigationItem = {
  key: KEYS.MODULE,
  label: 'Observability',
  icon: renderIcon('EyeOutlined'),
  children: [
    {
      key: KEYS.STATE_BROKER,
      label: 'State Broker',
      path: PATHS.STATE_BROKER,
      icon: renderIcon('ApiOutlined'),
    },
    {
      key: KEYS.PROMETHEUS,
      label: 'Metrics',
      path: PATHS.PROMETHEUS,
      icon: renderIcon('LineChartOutlined'),
    },
    {
      key: KEYS.EVENTS,
      label: 'System Events',
      path: PATHS.EVENTS,
      icon: renderIcon('BellOutlined'),
    },
    {
      key: KEYS.LOGS,
      label: 'Logs',
      path: PATHS.LOGS,
      icon: renderIcon('FileTextOutlined'),
    },
  ],
};

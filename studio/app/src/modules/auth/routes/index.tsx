/**
 * @module @kb-labs/studio-app/modules/auth/routes
 * Authentication module routing configuration
 */

import type { RouteObject } from 'react-router-dom';
import { LoginPage } from '../pages/login-page';
import { ErrorBoundary } from '../../../components/error-boundary';

// Route paths
const PATHS = {
  LOGIN: '/login',
} as const;

/**
 * Auth routes (no navigation - these are standalone pages)
 */
export const authRoutes: RouteObject[] = [
  {
    path: PATHS.LOGIN,
    element: <LoginPage />,
    errorElement: <ErrorBoundary />,
  },
];

/**
 * @module @kb-labs/studio-app/routes/types
 * Common types for modular routing system
 */

import type { RouteObject } from 'react-router-dom';
import type { NavigationItem } from '@/components/ui';

/**
 * Module routes configuration
 * Each module exports this to register its routes
 */
export interface ModuleRoutes {
  /** Routes for react-router */
  routes: RouteObject[];
  /** Navigation items for sidebar */
  navigation?: NavigationItem[];
}

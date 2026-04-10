/**
 * @module @kb-labs/studio-app/components/page-transition
 * Page transition wrapper with configurable animation types
 *
 * NOTE: Animation logic temporarily disabled.
 * Infrastructure kept for future UI animation features.
 */

import * as React from 'react';

export interface PageTransitionProps {
  children: React.ReactNode;
}

/**
 * Page transition wrapper component.
 * Currently renders children directly without animations.
 * The feature flag and settings infrastructure remain in place for future animation features.
 */
export function PageTransition({ children }: PageTransitionProps) {
  // Animation logic temporarily disabled - instant navigation preferred for SaaS
  // Infrastructure kept for potential future use with other UI animations
  return <>{children}</>;
}

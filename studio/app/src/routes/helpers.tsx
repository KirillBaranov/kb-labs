/**
 * @module @kb-labs/studio-app/routes/helpers
 * Common helpers for routing
 */

import * as React from 'react';
import { AVAILABLE_ICONS } from '@/components/ui';

/**
 * Render icon from available icons registry
 */
export function renderIcon(iconName?: string): React.ReactElement | undefined {
  if (!iconName) {
    return undefined;
  }

  const IconComponent = AVAILABLE_ICONS[iconName];

  if (!IconComponent) {
    console.warn(`Icon "${iconName}" not available in registry`);
    return undefined;
  }

  return React.createElement(IconComponent, { style: { fontSize: 16 } });
}

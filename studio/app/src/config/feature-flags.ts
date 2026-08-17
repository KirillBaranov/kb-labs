/**
 * @module @kb-labs/studio-app/config/feature-flags
 * Feature flags for experimental features
 */

export type FeatureId =
  // Developer Tools
  | 'devtools-panel'
  // Settings visibility
  | 'settings-system';

export type FeatureGroup = 'ui-ux' | 'performance';

export type FeatureStatus = 'alpha' | 'beta' | 'stable' | 'deprecated';

export type FeatureRisk = 'low' | 'medium' | 'high';

export interface FeatureFlag {
  id: FeatureId;
  name: string;
  description: string;
  group: FeatureGroup;
  status: FeatureStatus;
  risk: FeatureRisk;
  enabled: boolean;
  /** Default value when no user preference is set */
  defaultEnabled: boolean;
  /** Long-form details shown in tooltip */
  details?: string;
  /** Related features that might affect this one */
  dependencies?: FeatureId[];
  /** When this feature was added (for "New" badge) */
  addedAt?: string;
  /** If deprecated, when it will be removed */
  deprecatedAt?: string;
}

export const FEATURE_FLAGS: Record<FeatureId, FeatureFlag> = {
  'devtools-panel': {
    id: 'devtools-panel',
    name: 'DevTools Panel',
    description: 'Developer debug panel in Settings → Developer tab',
    details: 'Captures Module Federation loading events (including missing default exports) and EventBus events. Only useful during plugin development.',
    group: 'performance',
    status: 'alpha',
    risk: 'low',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2026-04-02',
  },

  'settings-system': {
    id: 'settings-system',
    name: 'System Settings Tab',
    description: 'Show the System tab in Settings',
    details: 'Advanced system-level settings (cache, registry, storage). Intended for admins; will move behind role-based access once roles are available.',
    group: 'ui-ux',
    status: 'stable',
    risk: 'low',
    enabled: false,
    defaultEnabled: true,
    addedAt: '2026-08-11',
  },
};

export const FEATURE_GROUPS: Record<FeatureGroup, { name: string; description: string; icon: string }> = {
  'ui-ux': {
    name: 'UI & UX',
    description: 'User interface and experience enhancements',
    icon: 'BgColorsOutlined',
  },
  performance: {
    name: 'Performance',
    description: 'Speed and efficiency improvements',
    icon: 'ThunderboltOutlined',
  },
};

/** Get features grouped by category */
export function getFeaturesByGroup(): Record<FeatureGroup, FeatureFlag[]> {
  const grouped: Record<FeatureGroup, FeatureFlag[]> = {
    'ui-ux': [],
    performance: [],
  };

  Object.values(FEATURE_FLAGS).forEach((flag) => {
    grouped[flag.group].push(flag);
  });

  return grouped;
}

/** Check if a feature is enabled based on user preferences */
export function isFeatureEnabled(
  featureId: FeatureId,
  userPreferences?: Record<FeatureId, boolean>
): boolean {
  const flag = FEATURE_FLAGS[featureId];
  if (!flag) {return false;}

  // If user has explicit preference, use that
  if (userPreferences && featureId in userPreferences) {
    return userPreferences[featureId];
  }

  // Otherwise use default
  return flag.defaultEnabled;
}

/** Get all enabled features */
export function getEnabledFeatures(userPreferences?: Record<FeatureId, boolean>): FeatureId[] {
  return Object.keys(FEATURE_FLAGS).filter((id) =>
    isFeatureEnabled(id as FeatureId, userPreferences)
  ) as FeatureId[];
}

/** Check if feature has dependencies and all are enabled */
export function areDependenciesMet(
  featureId: FeatureId,
  userPreferences?: Record<FeatureId, boolean>
): boolean {
  const flag = FEATURE_FLAGS[featureId];
  if (!flag.dependencies || flag.dependencies.length === 0) {return true;}

  return flag.dependencies.every((dep) => isFeatureEnabled(dep, userPreferences));
}

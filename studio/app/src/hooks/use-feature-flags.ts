/**
 * @module @kb-labs/studio-app/hooks/use-feature-flags
 * Hook to access and toggle feature flags
 */

import { useCallback, useMemo } from 'react';
import { useSettings } from '@/providers/settings-provider';
import type { FeatureId } from '@/config/feature-flags';
import { isFeatureEnabled as isEnabled, areDependenciesMet } from '@/config/feature-flags';

export interface UseFeatureFlagsReturn {
  /** Check if a feature is enabled */
  isEnabled: (featureId: FeatureId) => boolean;
  /** Toggle a feature on/off */
  toggleFeature: (featureId: FeatureId) => void;
  /** Enable a feature */
  enableFeature: (featureId: FeatureId) => void;
  /** Disable a feature */
  disableFeature: (featureId: FeatureId) => void;
  /** Get all enabled feature IDs */
  enabledFeatures: FeatureId[];
  /** Check if feature dependencies are met */
  areDependenciesMet: (featureId: FeatureId) => boolean;
}

export function useFeatureFlags(): UseFeatureFlagsReturn {
  const { settings, updateSettings } = useSettings();
  const enabledFeatures = useMemo(() => settings.experimental?.enabledFeatures ?? [], [settings.experimental?.enabledFeatures]);

  // Create a preferences map for efficient lookup
  const preferences = useMemo(() => {
    const map: Record<FeatureId, boolean> = {} as Record<FeatureId, boolean>;
    enabledFeatures.forEach((id) => {
      map[id] = true;
    });
    return map;
  }, [enabledFeatures]);

  const isFeatureEnabled = useCallback(
    (featureId: FeatureId): boolean => {
      return isEnabled(featureId, preferences);
    },
    [preferences]
  );

  const toggleFeature = useCallback(
    (featureId: FeatureId) => {
      const currentlyEnabled = enabledFeatures.includes(featureId);
      const newFeatures = currentlyEnabled
        ? enabledFeatures.filter((id) => id !== featureId)
        : [...enabledFeatures, featureId];

      updateSettings({
        experimental: {
          enabledFeatures: newFeatures,
        },
      });
    },
    [enabledFeatures, updateSettings]
  );

  const enableFeature = useCallback(
    (featureId: FeatureId) => {
      if (!enabledFeatures.includes(featureId)) {
        updateSettings({
          experimental: {
            enabledFeatures: [...enabledFeatures, featureId],
          },
        });
      }
    },
    [enabledFeatures, updateSettings]
  );

  const disableFeature = useCallback(
    (featureId: FeatureId) => {
      updateSettings({
        experimental: {
          enabledFeatures: enabledFeatures.filter((id) => id !== featureId),
        },
      });
    },
    [enabledFeatures, updateSettings]
  );

  const checkDependencies = useCallback(
    (featureId: FeatureId): boolean => {
      return areDependenciesMet(featureId, preferences);
    },
    [preferences]
  );

  return {
    isEnabled: isFeatureEnabled,
    toggleFeature,
    enableFeature,
    disableFeature,
    enabledFeatures,
    areDependenciesMet: checkDependencies,
  };
}

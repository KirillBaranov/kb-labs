/**
 * @module @kb-labs/studio-app/hooks/use-feature-flags
 * Hook to access and toggle feature flags
 */

import { useCallback, useMemo } from 'react';
import { useSettings } from '@/providers/settings-provider';
import type { FeatureId } from '@/config/feature-flags';
import { FEATURE_FLAGS, isFeatureEnabled as isEnabled, areDependenciesMet } from '@/config/feature-flags';

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
  const preferences = settings.experimental?.featurePreferences ?? {};

  const isFeatureEnabled = useCallback(
    (featureId: FeatureId): boolean => {
      return isEnabled(featureId, preferences);
    },
    [preferences]
  );

  const setPreference = useCallback(
    (featureId: FeatureId, value: boolean) => {
      updateSettings({
        experimental: {
          featurePreferences: { ...preferences, [featureId]: value },
        },
      });
    },
    [preferences, updateSettings]
  );

  const toggleFeature = useCallback(
    (featureId: FeatureId) => {
      setPreference(featureId, !isFeatureEnabled(featureId));
    },
    [isFeatureEnabled, setPreference]
  );

  const enableFeature = useCallback(
    (featureId: FeatureId) => setPreference(featureId, true),
    [setPreference]
  );

  const disableFeature = useCallback(
    (featureId: FeatureId) => setPreference(featureId, false),
    [setPreference]
  );

  const checkDependencies = useCallback(
    (featureId: FeatureId): boolean => {
      return areDependenciesMet(featureId, preferences);
    },
    [preferences]
  );

  const enabledFeatures = useMemo(
    () => (Object.keys(FEATURE_FLAGS) as FeatureId[]).filter((id) => isFeatureEnabled(id)),
    [isFeatureEnabled]
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

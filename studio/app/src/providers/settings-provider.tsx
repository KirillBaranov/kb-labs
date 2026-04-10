import * as React from 'react';
import type { FeatureId } from '@/config/feature-flags';

export interface NavigationCategory {
  id: string;
  label: string;
  order: number;
  itemKeys: string[];
}

export interface UserSettings {
  appearance: {
    theme: 'light' | 'dark' | 'auto';
    compactMode: boolean;
    fontSize: 'small' | 'medium' | 'large';
    pageTransition: 'none' | 'fade' | 'slide';
  };
  experimental: {
    /** User-enabled feature flags */
    enabledFeatures: FeatureId[];
  };
  navigation: {
    categories: NavigationCategory[];
  };
}

const DEFAULT_SETTINGS: UserSettings = {
  appearance: {
    theme: 'light',
    compactMode: false,
    fontSize: 'medium',
    pageTransition: 'none',
  },
  experimental: {
    enabledFeatures: [],
  },
  navigation: {
    categories: [],
  },
};

interface SettingsContextValue {
  settings: UserSettings;
  updateSettings: (updates: Partial<UserSettings>) => void;
  resetSettings: () => void;
  exportSettings: () => void;
  importSettings: (jsonString: string) => void;
}

const SettingsContext = React.createContext<SettingsContextValue | undefined>(undefined);

const STORAGE_KEY = 'kb-studio-settings';

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<UserSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Deep merge to ensure new fields are properly initialized
        return {
          appearance: { ...DEFAULT_SETTINGS.appearance, ...(parsed.appearance || {}) },
          experimental: { ...DEFAULT_SETTINGS.experimental, ...(parsed.experimental || {}) },
          navigation: { ...DEFAULT_SETTINGS.navigation, ...(parsed.navigation || {}) },
        };
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    return DEFAULT_SETTINGS;
  });

  // Save to localStorage whenever settings change
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, [settings]);

  // Apply settings to document
  React.useEffect(() => {
    const { compactMode, fontSize } = settings.appearance;

    // Apply compact mode class
    if (compactMode) {
      document.documentElement.classList.add('compact-mode');
    } else {
      document.documentElement.classList.remove('compact-mode');
    }

    // Apply font size class
    document.documentElement.classList.remove('font-small', 'font-medium', 'font-large');
    document.documentElement.classList.add(`font-${fontSize}`);
  }, [settings]);

  const updateSettings = React.useCallback((updates: Partial<UserSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...updates,
      appearance: {
        ...prev.appearance,
        ...(updates.appearance || {}),
      },
      experimental: {
        ...prev.experimental,
        ...(updates.experimental || {}),
      },
      navigation: {
        ...prev.navigation,
        ...(updates.navigation || {}),
      },
    }));
  }, []);

  const resetSettings = React.useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const exportSettings = React.useCallback(() => {
    const json = JSON.stringify(settings, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kb-studio-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [settings]);

  const importSettings = React.useCallback((jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      setSettings({ ...DEFAULT_SETTINGS, ...parsed });
    } catch {
      throw new Error('Invalid settings file');
    }
  }, []);

  const value = React.useMemo(
    () => ({ settings, updateSettings, resetSettings, exportSettings, importSettings }),
    [settings, updateSettings, resetSettings, exportSettings, importSettings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = React.useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}

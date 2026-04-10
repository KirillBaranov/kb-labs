import * as React from 'react';
import { ConfigProvider } from 'antd';
import type { ConfigProviderProps, ThemeConfig } from 'antd';
import { getAntDesignTokens, getAntDesignComponents } from '@kb-labs/studio-hooks';
import { ThemeTransitionOverlay } from './theme-transition-overlay';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface KBConfigProviderProps extends Omit<ConfigProviderProps, 'theme'> {
  defaultTheme?: ThemeMode;
  storageKey?: string;
  children: React.ReactNode;
}

const KBConfigProviderContext = React.createContext<{
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}>({
  theme: 'light',
  setTheme: () => {},
});

export function KBConfigProvider({
  defaultTheme = 'light',
  storageKey = 'studio-ui-theme',
  children,
  ...configProps
}: KBConfigProviderProps) {
  // Get initial theme
  const getInitialTheme = (): ThemeMode => {
    if (typeof window === 'undefined') {return defaultTheme;}
    const stored = localStorage.getItem(storageKey) as ThemeMode;
    return stored || defaultTheme;
  };

  const [theme, setThemeState] = React.useState<ThemeMode>(getInitialTheme);
  const [showOverlay, setShowOverlay] = React.useState(false);
  const [overlayTheme, setOverlayTheme] = React.useState<ThemeMode>(theme);
  const [isInitialMount, setIsInitialMount] = React.useState(true);

  // Get actual theme for tokens (auto -> system preference)
  const actualTheme = React.useMemo(() => {
    if (typeof window === 'undefined') {return theme === 'auto' ? 'light' : theme;}
    return theme === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
  }, [theme]);

  // Apply theme class SYNCHRONOUSLY on mount and theme change
  // This ensures CSS variables are correct before tokens are computed
  React.useLayoutEffect(() => {
    if (typeof window === 'undefined') {return;}
    
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(actualTheme);
    root.setAttribute('data-theme', actualTheme);
  }, [actualTheme]);

  // Store theme in localStorage (non-blocking)
  React.useEffect(() => {
    if (typeof window === 'undefined') {return;}
    localStorage.setItem(storageKey, theme);
  }, [theme, storageKey]);

  // Mark initial mount as complete after first render
  React.useEffect(() => {
    setIsInitialMount(false);
  }, []);

  const setTheme = React.useCallback((newTheme: ThemeMode) => {
    // Skip overlay on initial mount
    if (isInitialMount) {
      setThemeState(newTheme);
      return;
    }

    // Show overlay with new theme label
    setOverlayTheme(newTheme);
    setShowOverlay(true);

    // Wait for overlay to slide down (300ms)
    setTimeout(() => {
      // Change theme while overlay covers the screen
      setThemeState(newTheme);

      // Hold overlay to let color transition finish (150ms transition + 100ms buffer)
      setTimeout(() => {
        // Slide overlay back up
        setShowOverlay(false);
      }, 250);
    }, 300);
  }, [isInitialMount]);

  // Tokens now use CSS variables via var() - no need to recompute
  const tokens = React.useMemo(() => getAntDesignTokens(), []);
  const components = React.useMemo(() => getAntDesignComponents(), []);
  // Don't use algorithm - it would invert colors again
  // CSS variables already handle theme switching via .light/.dark classes
  // const algorithm = React.useMemo(() => getThemeAlgorithm(theme), [theme]);

  const value = React.useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  const themeConfig: ThemeConfig = React.useMemo(
    () => ({
      token: tokens,
      components: components,
      // algorithm: algorithm, // Disabled - CSS variables handle theme
    }),
    [tokens, components]
  );

  return (
    <KBConfigProviderContext.Provider value={value}>
      <ConfigProvider theme={themeConfig} {...configProps}>
        {children}
        <ThemeTransitionOverlay show={showOverlay} theme={overlayTheme} />
      </ConfigProvider>
    </KBConfigProviderContext.Provider>
  );
}

export function useKBTheme() {
  const context = React.useContext(KBConfigProviderContext);
  if (context === undefined) {
    throw new Error('useKBTheme must be used within KBConfigProvider');
  }
  return context;
}


import { theme } from 'antd';
import {
  colors,
  spacing,
  typography,
  radius,
  shadows,
  lightSemanticColors,
  darkSemanticColors,
} from '@kb-labs/studio-ui-core';

/**
 * Semantic tokens — theme-aware colors for backgrounds, text, borders, status.
 * These mirror the CSS variables injected by Studio host (e.g. `var(--bg-primary)`).
 */
export interface SemanticTokens {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  borderPrimary: string;
  borderSecondary: string;
  link: string;
  linkHover: string;
  accentSubtle: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  disabled: string;
  shadow: string;
}

export interface UseThemeReturn {
  /** Current theme mode */
  mode: 'light' | 'dark';
  /** Ant Design design token */
  antdToken: ReturnType<typeof theme.useToken>['token'];
  /** KB Labs semantic tokens (theme-aware) */
  semantic: SemanticTokens;
  /** Raw design tokens (colors, spacing, typography, radius, shadows) */
  tokens: {
    colors: typeof colors;
    spacing: typeof spacing;
    typography: typeof typography;
    radius: typeof radius;
    shadows: typeof shadows;
  };
}

const LIGHT_SEMANTIC: SemanticTokens = {
  bgPrimary: lightSemanticColors['bg-primary'],
  bgSecondary: lightSemanticColors['bg-secondary'],
  bgTertiary: lightSemanticColors['bg-tertiary'],
  textPrimary: lightSemanticColors['text-primary'],
  textSecondary: lightSemanticColors['text-secondary'],
  textTertiary: lightSemanticColors['text-tertiary'],
  textInverse: lightSemanticColors['text-inverse'],
  borderPrimary: lightSemanticColors['border-primary'],
  borderSecondary: lightSemanticColors['border-secondary'],
  link: lightSemanticColors['link'],
  linkHover: lightSemanticColors['link-hover'],
  accentSubtle: lightSemanticColors['accent-subtle'],
  success: lightSemanticColors['success'],
  warning: lightSemanticColors['warning'],
  error: lightSemanticColors['error'],
  info: lightSemanticColors['info'],
  disabled: lightSemanticColors['disabled'],
  shadow: lightSemanticColors['shadow'],
};

const DARK_SEMANTIC: SemanticTokens = {
  bgPrimary: darkSemanticColors['bg-primary'],
  bgSecondary: darkSemanticColors['bg-secondary'],
  bgTertiary: darkSemanticColors['bg-tertiary'],
  textPrimary: darkSemanticColors['text-primary'],
  textSecondary: darkSemanticColors['text-secondary'],
  textTertiary: darkSemanticColors['text-tertiary'],
  textInverse: darkSemanticColors['text-inverse'],
  borderPrimary: darkSemanticColors['border-primary'],
  borderSecondary: darkSemanticColors['border-secondary'],
  link: darkSemanticColors['link'],
  linkHover: darkSemanticColors['link-hover'],
  accentSubtle: darkSemanticColors['accent-subtle'],
  success: darkSemanticColors['success'],
  warning: darkSemanticColors['warning'],
  error: darkSemanticColors['error'],
  info: darkSemanticColors['info'],
  disabled: darkSemanticColors['disabled'],
  shadow: darkSemanticColors['shadow'],
};

/**
 * Theme hook for plugin pages.
 *
 * Three levels of access:
 * - `semantic` — high-level themed tokens (bgPrimary, textPrimary, success, error...)
 * - `antdToken` — Ant Design's full design token for antd component customization
 * - `tokens` — raw design tokens (colors, spacing, typography, radius, shadows)
 *
 * CSS variables (`var(--bg-primary)`, `var(--text-primary)`) are also available
 * in stylesheets — injected by the Studio host into `:root`.
 *
 * @example
 * ```tsx
 * const { semantic, tokens, mode } = useTheme();
 *
 * // Semantic tokens (recommended)
 * <div style={{ color: semantic.textPrimary, background: semantic.bgSecondary }}>
 *
 * // CSS variables in stylesheets
 * // .my-component { color: var(--text-primary); }
 *
 * // Raw tokens for specific shades
 * <div style={{ color: tokens.colors.primary[600] }}>
 * ```
 */
export function useTheme(): UseThemeReturn {
  const { token: antdToken } = theme.useToken();

  // TODO: wire into Studio's theme mode zustand store
  const mode = 'light' as 'light' | 'dark';

  return {
    mode,
    antdToken,
    semantic: mode === 'dark' ? DARK_SEMANTIC : LIGHT_SEMANTIC,
    tokens: { colors, spacing, typography, radius, shadows },
  };
}

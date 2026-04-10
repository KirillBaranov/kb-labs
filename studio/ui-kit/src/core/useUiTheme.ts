/**
 * useUITheme - Access design tokens from the current theme
 *
 * Wraps antd's theme.useToken() to decouple app from antd internals.
 *
 * @example
 * ```tsx
 * import { useUITheme } from '@kb-labs/studio-ui-kit';
 *
 * function MyComponent() {
 *   const { token } = useUITheme();
 *   return <div style={{ color: token.colorPrimary }}>Themed text</div>;
 * }
 * ```
 */

import { theme, type GlobalToken } from 'antd';

export interface UIThemeResult {
  token: GlobalToken;
  hashId: string;
  theme: ReturnType<typeof theme.useToken>['theme'];
}

export function useUITheme(): UIThemeResult {
  const result = theme.useToken();
  return result as UIThemeResult;
}

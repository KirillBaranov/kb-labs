import type { Colors, Spacing, Typography, Radius, Shadows } from '../tokens';

export interface Theme {
  colors: Colors;
  spacing: Spacing;
  typography: Typography;
  radius: Radius;
  shadows: Shadows;
}

export type ThemeMode = 'light' | 'dark';


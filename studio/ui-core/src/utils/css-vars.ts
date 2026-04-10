import type { Theme } from '../themes/types';
import { lightSemanticColors, darkSemanticColors } from '../themes/semantic-colors';

export function generateCSSVars(theme: Theme, semanticColors: Record<string, string>): string {
  const { colors, spacing, typography, radius, shadows } = theme;
  
  const cssVars: string[] = [];

  // Semantic colors (theme-aware)
  Object.entries(semanticColors).forEach(([key, value]) => {
    cssVars.push(`  --${key}: ${value};`);
  });

  // Raw color tokens
  Object.entries(colors).forEach(([colorName, colorValue]) => {
    if (typeof colorValue === 'object' && colorValue !== null) {
      Object.entries(colorValue).forEach(([shade, value]) => {
        cssVars.push(`  --color-${colorName}-${shade}: ${value};`);
      });
    }
  });

  // Spacing
  Object.entries(spacing).forEach(([key, value]) => {
    cssVars.push(`  --spacing-${key}: ${value};`);
  });

  // Typography
  Object.entries(typography).forEach(([key, value]) => {
    if (typeof value === 'object') {
      Object.entries(value).forEach(([prop, val]) => {
        cssVars.push(`  --typography-${key}-${prop}: ${val};`);
      });
    } else {
      cssVars.push(`  --typography-${key}: ${value};`);
    }
  });

  // Radius
  Object.entries(radius).forEach(([key, value]) => {
    cssVars.push(`  --radius-${key}: ${value};`);
  });

  // Shadows
  Object.entries(shadows).forEach(([key, value]) => {
    cssVars.push(`  --shadow-${key}: ${value};`);
  });

  return cssVars.join('\n');
}

export function generateThemeCSS(lightTheme: Theme, darkTheme: Theme): string {
  return `
:root {
${generateCSSVars(lightTheme, lightSemanticColors)}
}

.dark {
${generateCSSVars(darkTheme, darkSemanticColors)}
}
`.trim();
}


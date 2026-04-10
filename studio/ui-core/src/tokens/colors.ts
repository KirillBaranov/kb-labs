export const colors = {
  // Primary brand colors
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    950: '#172554',
  },
  
  // Secondary accent colors
  secondary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
    950: '#082f49',
  },
  
  // Semantic colors
  success: {
    50: '#f0fdf4',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
  },
  
  warning: {
    50: '#fffbeb',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
  },
  
  error: {
    50: '#fef2f2',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
  },
  
  // Neutral grays - updated to KB Labs UI Color Kit
  neutral: {
    0: '#ffffff',        // Light: Surface/Card
    50: '#f9fafb',       // Light: Background
    100: '#f3f4f6',      // Light: Muted Surface
    200: '#e5e7eb',      // Light: Border
    300: '#d4d4d4',      // Light: Lighter borders
    400: '#9ca3af',      // Light: Disabled
    500: '#6b7280',      // Light: Text Secondary
    600: '#525252',      // Light: Darker text
    700: '#404040',      // Dark: Lighter borders
    800: '#27272a',      // Dark: Muted Surface
    900: '#1a1a1c',      // Dark: Surface/Card
    950: '#0d0d0f',      // Dark: Background
  },
  
  // Muted/subtle colors - updated to KB Labs UI Color Kit
  muted: {
    background: '#F3F4F6',  // Light: Muted Surface
    foreground: '#6B7280',   // Light: Text Secondary
  },
} as const;

export type Colors = typeof colors;


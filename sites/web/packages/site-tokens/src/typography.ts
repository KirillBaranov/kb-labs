export const fontFamilies = {
  body:    ['var(--font-body)', 'Segoe UI', 'system-ui', 'sans-serif'],
  heading: ['var(--font-heading)', 'var(--font-body)', 'system-ui', 'sans-serif'],
  mono:    ["'Geist Mono'", "'SF Mono'", "'Fira Code'", 'monospace'],
} as const;

export const fontSizes = {
  xs:   '0.72rem',
  sm:   '0.875rem',
  base: '1rem',
  lg:   '1.05rem',
  xl:   '1.1rem',
  '2xl': '1.35rem',
  '3xl': '1.6rem',
  '4xl': '2.4rem',
  '5xl': '2.9rem',
} as const;

export const fontWeights = {
  normal:    400,
  medium:    500,
  semibold:  600,
  bold:      700,
  extrabold: 750,
} as const;

export const lineHeights = {
  tight:   1.1,
  snug:    1.25,
  normal:  1.5,
  relaxed: 1.6,
  loose:   1.75,
} as const;

export const letterSpacings = {
  tight:  '-0.03em',
  snug:   '-0.02em',
  normal: '0',
  wide:   '0.08em',
  wider:  '0.09em',
  widest: '0.11em',
} as const;

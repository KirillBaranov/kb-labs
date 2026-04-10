/**
 * UIStack component - Vertical/horizontal spacing layout
 *
 * Simplified wrapper around UIFlex for consistent spacing.
 * NO inline styles, uses spacing tokens.
 */

import * as React from 'react';
import { UIFlex } from '../primitives/UIFlex';
import type { UIBoxSpacingValue } from '../primitives/UIBox';

export type UIStackDirection = 'vertical' | 'horizontal';
export type UIStackSpacing = UIBoxSpacingValue;
export type UIStackAlign = 'start' | 'end' | 'center' | 'stretch';

export interface UIStackProps {
  /** Stack direction */
  direction?: UIStackDirection;
  /** Spacing between items (from design tokens) */
  spacing?: UIStackSpacing;
  /** Align items */
  align?: UIStackAlign;
  /** Stack content */
  children: React.ReactNode;
  /** HTML element to render */
  as?: keyof JSX.IntrinsicElements;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * UIStack - Consistent spacing layout
 *
 * @example
 * ```tsx
 * <UIStack direction="vertical" spacing={4}>
 *   <Card>Item 1</Card>
 *   <Card>Item 2</Card>
 *   <Card>Item 3</Card>
 * </UIStack>
 *
 * <UIStack direction="horizontal" spacing={2} align="center">
 *   <Button>Cancel</Button>
 *   <Button>Submit</Button>
 * </UIStack>
 * ```
 */
export function UIStack({
  direction = 'vertical',
  spacing = 2,
  align,
  children,
  as,
  className,
  style,
}: UIStackProps) {
  return (
    <UIFlex
      direction={direction === 'vertical' ? 'column' : 'row'}
      gap={spacing}
      align={align}
      as={as}
      className={className}
      style={style}
    >
      {children}
    </UIFlex>
  );
}

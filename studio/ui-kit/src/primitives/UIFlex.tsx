/**
 * Flex component - Flexbox layout primitive
 *
 * Uses spacing tokens for gap. NO inline styles for layout.
 */

import * as React from 'react';
import { spacing } from '@kb-labs/studio-ui-core';
import type { UIBoxSpacingValue } from './UIBox';

export type UIFlexSpacingValue = UIBoxSpacingValue;

export interface UIFlexProps {
  /** Flex content */
  children: React.ReactNode;
  /** Flex direction */
  direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  /** Justify content */
  justify?: 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly';
  /** Align items */
  align?: 'start' | 'end' | 'center' | 'baseline' | 'stretch';
  /** Gap from design tokens */
  gap?: UIFlexSpacingValue;
  /** Wrap behavior */
  wrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  /** HTML element to render */
  as?: keyof JSX.IntrinsicElements;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * Flex layout component
 *
 * @example
 * ```tsx
 * <Flex direction="row" gap={2} align="center">
 *   <Text>Item 1</Text>
 *   <Text>Item 2</Text>
 * </Flex>
 * ```
 */
export function UIFlex({
  children,
  direction = 'row',
  justify = 'start',
  align = 'stretch',
  gap,
  wrap = 'nowrap',
  as: Component = 'div',
  className,
  style: customStyle,
}: UIFlexProps) {
  const justifyMap = {
    start: 'flex-start',
    end: 'flex-end',
    center: 'center',
    between: 'space-between',
    around: 'space-around',
    evenly: 'space-evenly',
  };

  const alignMap = {
    start: 'flex-start',
    end: 'flex-end',
    center: 'center',
    baseline: 'baseline',
    stretch: 'stretch',
  };

  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: direction,
    justifyContent: justifyMap[justify],
    alignItems: alignMap[align],
    flexWrap: wrap,
    ...(gap !== undefined && { gap: spacing[gap] }),
    ...customStyle,
  };

  return (
    <Component style={style} className={className}>
      {children}
    </Component>
  );
}

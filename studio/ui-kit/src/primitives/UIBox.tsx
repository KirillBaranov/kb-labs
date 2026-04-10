/**
 * Box component - Layout primitive with spacing tokens
 *
 * Uses tokens from @kb-labs/studio-ui-core for consistent spacing.
 * NO inline styles for spacing/sizing.
 */

import * as React from 'react';
import { spacing } from '@kb-labs/studio-ui-core';

export type UIBoxSpacingValue = keyof typeof spacing;

export interface UIBoxProps {
  /** Box content */
  children: React.ReactNode;
  /** Padding from design tokens */
  p?: UIBoxSpacingValue;
  /** Padding top */
  pt?: UIBoxSpacingValue;
  /** Padding right */
  pr?: UIBoxSpacingValue;
  /** Padding bottom */
  pb?: UIBoxSpacingValue;
  /** Padding left */
  pl?: UIBoxSpacingValue;
  /** Margin from design tokens */
  m?: UIBoxSpacingValue;
  /** Margin top */
  mt?: UIBoxSpacingValue;
  /** Margin right */
  mr?: UIBoxSpacingValue;
  /** Margin bottom */
  mb?: UIBoxSpacingValue;
  /** Margin left */
  ml?: UIBoxSpacingValue;
  /** HTML element to render */
  as?: keyof JSX.IntrinsicElements;
  /** Additional CSS class */
  className?: string;
  /** Additional styles (use sparingly) */
  style?: React.CSSProperties;
}

/**
 * Box component with spacing tokens
 *
 * @example
 * ```tsx
 * <Box p={4} mb={2}>Content</Box>
 * <Box pt={2} pb={3}>Asymmetric padding</Box>
 * ```
 */
export function UIBox({
  children,
  p,
  pt,
  pr,
  pb,
  pl,
  m,
  mt,
  mr,
  mb,
  ml,
  as: Component = 'div',
  className,
  style: customStyle,
}: UIBoxProps) {
  const style: React.CSSProperties = {
    ...(p !== undefined && { padding: spacing[p] }),
    ...(pt !== undefined && { paddingTop: spacing[pt] }),
    ...(pr !== undefined && { paddingRight: spacing[pr] }),
    ...(pb !== undefined && { paddingBottom: spacing[pb] }),
    ...(pl !== undefined && { paddingLeft: spacing[pl] }),
    ...(m !== undefined && { margin: spacing[m] }),
    ...(mt !== undefined && { marginTop: spacing[mt] }),
    ...(mr !== undefined && { marginRight: spacing[mr] }),
    ...(mb !== undefined && { marginBottom: spacing[mb] }),
    ...(ml !== undefined && { marginLeft: spacing[ml] }),
    ...customStyle,
  };

  return (
    <Component style={style} className={className}>
      {children}
    </Component>
  );
}

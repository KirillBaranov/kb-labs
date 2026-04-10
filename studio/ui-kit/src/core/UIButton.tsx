/**
 * UIButton component - Action button with semantic variants
 *
 * Wraps Ant Design Button with consistent styling and proper SVG icon theming.
 * NO hardcoded colors, uses Ant Design theme tokens + CSS variables.
 *
 * IMPORTANT: This component ensures all SVG icons (lucide-react, etc.)
 * inherit colors correctly in both light and dark themes through CSS.
 */

import * as React from 'react';
import { Button as AntButton, type ButtonProps as AntButtonProps } from 'antd';
import styles from './UIButton.module.css';

export type UIButtonVariant = 'primary' | 'default' | 'dashed' | 'text' | 'link';

export interface UIButtonProps extends Omit<AntButtonProps, 'type' | 'variant'> {
  /** Button variant (maps to Ant Design 'type' prop) */
  variant?: UIButtonVariant;
  /** Additional CSS class */
  className?: string;
}

/**
 * UIButton - Action button with proper icon theming
 *
 * @example
 * ```tsx
 * import { X, Check } from 'lucide-react';
 *
 * <UIButton variant="primary">Submit</UIButton>
 * <UIButton variant="default" icon={<Check />}>Confirm</UIButton>
 * <UIButton variant="text" danger icon={<X />}>Delete</UIButton>
 * <UIButton variant="text" icon={<X />} /> // Icon-only close button
 * ```
 */
export const UIButton = React.forwardRef<HTMLButtonElement, UIButtonProps>(
  function UIButton({ variant = 'default', className, ...rest }, ref) {
    const combinedClassName = [styles.uiButton, className].filter(Boolean).join(' ');
    return (
      <AntButton
        ref={ref}
        type={variant}
        className={combinedClassName}
        {...rest}
      />
    );
  },
);

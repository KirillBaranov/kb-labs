/**
 * UICopyButton — one-click copy with built-in visual feedback.
 *
 * Shows a checkmark for 1.5s after copying, no toast required.
 * Accepts `value` to copy and optional `label` for accessibility.
 */

import * as React from 'react';
import { UIButton } from './UIButton';
import { UIIcon } from './UIIcon';
import type { UIButtonProps } from './UIButton';

export interface UICopyButtonProps
  extends Omit<UIButtonProps, 'onClick' | 'icon' | 'children' | 'variant'> {
  /** Text to copy */
  value: string;
  /** Button size */
  size?: 'small' | 'middle' | 'large';
  /** Show label next to icon */
  label?: string;
}

export function UICopyButton({ value, size = 'small', label, style, ...rest }: UICopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <UIButton
      variant="text"
      size={size}
      icon={
        <UIIcon
          name={copied ? 'CheckOutlined' : 'CopyOutlined'}
          style={{ color: copied ? '#52c41a' : undefined, transition: 'color 150ms ease' }}
        />
      }
      onClick={handleCopy}
      style={{ transition: 'opacity 150ms ease', ...style }}
      {...rest}
    >
      {label}
    </UIButton>
  );
}

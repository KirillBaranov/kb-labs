/**
 * UIIcon component - Icon wrapper with proper theming
 *
 * Provides consistent icon sizing and coloring using CSS variables.
 * Supports Ant Design icons, lucide-react, and custom SVG icons.
 * NO hardcoded colors, uses CSS variables for theme support.
 *
 * IMPORTANT: All icons (SVG, icon fonts) inherit colors through CSS.
 */

import * as React from 'react';
import styles from './UIIcon.module.css';

export type UIIconSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';
export type UIIconColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'inherit';

export interface UIIconProps {
  /** Icon component or icon name (e.g., 'HomeOutlined') */
  icon?: React.ReactNode | string;
  /** Icon name (alternative to icon prop) */
  name?: string;
  /** Icon size */
  size?: UIIconSize;
  /** Icon color */
  color?: UIIconColor;
  /** Spin animation */
  spin?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * Icon resolver registry — call registerIconRenderer() once at app startup
 * to wire up the icon lookup (e.g. from @/components/ui/icons renderIcon).
 */
type IconRenderer = (name: string) => React.ReactNode | null;
let _iconRenderer: IconRenderer | null = null;

export function registerIconRenderer(renderer: IconRenderer): void {
  _iconRenderer = renderer;
}

/**
 * UIIcon - Icon wrapper with CSS-based theming
 *
 * @example
 * ```tsx
 * import { CheckCircleOutlined } from '@ant-design/icons';
 * import { Check } from 'lucide-react';
 *
 * // Ant Design icon
 * <UIIcon icon={<CheckCircleOutlined />} color="success" />
 *
 * // lucide-react icon
 * <UIIcon icon={<Check />} color="success" size="lg" />
 *
 * // Using icon name (from AVAILABLE_ICONS)
 * <UIIcon name="HomeOutlined" size="lg" />
 * <UIIcon icon="SettingOutlined" color="primary" />
 *
 * <UIIcon icon={<LoadingOutlined />} spin />
 *
 * <UIIcon
 *   name="SettingOutlined"
 *   size="lg"
 *   onClick={handleSettings}
 * />
 * ```
 */
export function UIIcon({
  icon,
  name,
  size = 'base',
  color = 'inherit',
  spin = false,
  onClick,
  className,
  style: customStyle,
}: UIIconProps) {
  // Build CSS classes
  // 'anticon' class is required so Ant Design components (e.g. Tag icon prop)
  // apply correct margin/spacing — it's the standard Ant Design icon marker class
  const classes = [
    styles.uiIcon,
    'anticon',
    styles[`size-${size}`],
    styles[`color-${color}`],
    spin && styles.spin,
    onClick && styles.clickable,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Resolve icon: name prop > string icon > React element icon
  let iconElement: React.ReactNode = null;

  const iconName = name || (typeof icon === 'string' ? icon : null);
  if (iconName) {
    if (_iconRenderer) {
      iconElement = _iconRenderer(iconName);
    } else {
      console.warn(`Icon "${iconName}" could not be loaded. Call registerIconRenderer() at app startup.`);
      iconElement = null;
    }
  } else if (React.isValidElement(icon)) {
    iconElement = icon;
  }

  if (!iconElement) {
    return null;
  }

  return (
    <span
      className={classes}
      style={customStyle}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {iconElement}
    </span>
  );
}

/**
 * Icon helper for common use cases
 */
export const UIIconButton = ({
  icon,
  name,
  onClick,
  size = 'base',
  color = 'primary',
  ...props
}: UIIconProps) => (
  <UIIcon
    icon={icon}
    name={name}
    size={size}
    color={color}
    onClick={onClick}
    style={{ cursor: 'pointer', transition: 'opacity 0.2s', ...props.style }}
    {...props}
  />
);

/**
 * UISwitch component - Toggle switch
 *
 * Wraps Ant Design Switch with label positioning.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Switch as AntSwitch } from 'antd';
import type { SwitchProps as AntSwitchProps } from 'antd';
import { UIFlex } from '../primitives/UIFlex';
import { UIText } from '../primitives/UIText';

export type UISwitchSize = 'small' | 'default';
export type UISwitchLabelPosition = 'left' | 'right';

export interface UISwitchProps extends Omit<AntSwitchProps, 'onChange'> {
  /** Checked state */
  checked?: boolean;
  /** Default checked state */
  defaultChecked?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Switch size */
  size?: UISwitchSize;
  /** Label text */
  label?: string;
  /** Label position */
  labelPosition?: UISwitchLabelPosition;
  /** Checked children (text inside switch when on) */
  checkedChildren?: React.ReactNode;
  /** Unchecked children (text inside switch when off) */
  unCheckedChildren?: React.ReactNode;
  /** Change handler (returns checked boolean) */
  onChange?: (checked: boolean) => void;
}

/**
 * UISwitch - Toggle switch
 *
 * @example
 * ```tsx
 * <UISwitch label="Enable notifications" />
 * <UISwitch label="Dark mode" labelPosition="left" />
 * <UISwitch
 *   checkedChildren="ON"
 *   unCheckedChildren="OFF"
 *   defaultChecked
 * />
 * ```
 */
export function UISwitch({
  checked,
  defaultChecked,
  disabled,
  loading,
  size = 'default',
  label,
  labelPosition = 'right',
  checkedChildren,
  unCheckedChildren,
  onChange,
  ...rest
}: UISwitchProps) {
  const switchElement = (
    <AntSwitch
      checked={checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      loading={loading}
      size={size}
      checkedChildren={checkedChildren}
      unCheckedChildren={unCheckedChildren}
      onChange={onChange}
      {...rest}
    />
  );

  if (!label) {
    return switchElement;
  }

  return (
    <UIFlex align="center" gap={2}>
      {labelPosition === 'left' && <UIText>{label}</UIText>}
      {switchElement}
      {labelPosition === 'right' && <UIText>{label}</UIText>}
    </UIFlex>
  );
}

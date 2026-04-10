/**
 * UISelect component - Dropdown select with icon support
 *
 * Wraps Ant Design Select with enhanced options.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Select as AntSelect } from 'antd';
import type { SelectProps as AntSelectProps } from 'antd';
import { UIFlex } from '../primitives/UIFlex';

export interface UISelectOption {
  /** Option label */
  label: string;
  /** Option value */
  value: string | number;
  /** Optional icon */
  icon?: React.ReactNode;
  /** Disabled option */
  disabled?: boolean;
  /** Option description */
  description?: string;
}

export interface UISelectProps extends Omit<AntSelectProps, 'options' | 'onChange'> {
  /** Select options */
  options: UISelectOption[];
  /** Selected value */
  value?: string | number | (string | number)[];
  /** Default value */
  defaultValue?: string | number | (string | number)[];
  /** Placeholder */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Allow clear */
  allowClear?: boolean;
  /** Enable search */
  showSearch?: boolean;
  /** Multiple selection */
  mode?: 'multiple' | 'tags';
  /** Change handler (returns value, not event) */
  onChange?: (value: string | number | (string | number)[]) => void;
}

/**
 * UISelect - Dropdown select
 *
 * @example
 * ```tsx
 * <UISelect
 *   options={[
 *     { label: 'Option 1', value: 1 },
 *     { label: 'Option 2', value: 2, icon: <Icon /> },
 *   ]}
 *   placeholder="Select option"
 * />
 *
 * <UISelect
 *   mode="multiple"
 *   options={options}
 *   showSearch
 *   allowClear
 * />
 * ```
 */
export function UISelect({
  options = [],
  value,
  defaultValue,
  placeholder,
  disabled,
  loading,
  allowClear,
  showSearch,
  mode,
  onChange,
  ...rest
}: UISelectProps) {
  // Transform options to support icon + description
  const transformedOptions = options.map((opt) => ({
    label: opt.icon || opt.description ? (
      <UIFlex align="center" gap={2} style={{ width: '100%' }}>
        {opt.icon && <span>{opt.icon}</span>}
        <span style={{ flex: 1 }}>{opt.label}</span>
        {opt.description && (
          <span style={{ fontSize: '0.85em', opacity: 0.7 }}>
            {opt.description}
          </span>
        )}
      </UIFlex>
    ) : opt.label,
    value: opt.value,
    disabled: opt.disabled,
  }));

  return (
    <AntSelect
      options={transformedOptions}
      value={value}
      defaultValue={defaultValue}
      placeholder={placeholder}
      disabled={disabled}
      loading={loading}
      allowClear={allowClear}
      showSearch={showSearch}
      mode={mode}
      onChange={onChange}
      {...rest}
    />
  );
}

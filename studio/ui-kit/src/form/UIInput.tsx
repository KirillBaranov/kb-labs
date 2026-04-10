/**
 * UIInput component - Text input with variants
 *
 * Wraps Ant Design Input with semantic variants.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Input as AntInput } from 'antd';
import type { InputProps as AntInputProps } from 'antd';

export interface UIInputProps extends Omit<AntInputProps, 'onChange'> {
  /** Input value */
  value?: string;
  /** Default value */
  defaultValue?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Prefix icon/element */
  prefix?: React.ReactNode;
  /** Suffix icon/element */
  suffix?: React.ReactNode;
  /** Max length */
  maxLength?: number;
  /** Show character count */
  showCount?: boolean;
  /** Allow clear */
  allowClear?: boolean;
  /** Change handler (returns value string, not event) */
  onChange?: (value: string) => void;
  /** Enter key handler */
  onPressEnter?: () => void;
}

/**
 * UIInput - Text input
 *
 * @example
 * ```tsx
 * <UIInput placeholder="Enter name" />
 * <UIInput prefix={<SearchIcon />} placeholder="Search..." />
 * <UIInput allowClear showCount maxLength={100} />
 * ```
 */
export function UIInput({
  value,
  defaultValue,
  placeholder,
  disabled,
  prefix,
  suffix,
  maxLength,
  showCount,
  allowClear,
  onChange,
  onPressEnter,
  ...rest
}: UIInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value);
  };

  return (
    <AntInput
      value={value}
      defaultValue={defaultValue}
      placeholder={placeholder}
      disabled={disabled}
      prefix={prefix}
      suffix={suffix}
      maxLength={maxLength}
      showCount={showCount}
      allowClear={allowClear}
      onChange={handleChange}
      onPressEnter={onPressEnter}
      {...rest}
    />
  );
}

/**
 * UIInputPassword - Password input with toggle visibility
 */
export function UIInputPassword(props: React.ComponentProps<typeof AntInput.Password>) {
  return <AntInput.Password {...props} />;
}

/**
 * UIInputTextArea - Multiline text input
 */
export function UIInputTextArea(props: React.ComponentProps<typeof AntInput.TextArea>) {
  return <AntInput.TextArea {...props} />;
}

/**
 * UIInputSearch - Search input with search button
 */
export function UIInputSearch(props: React.ComponentProps<typeof AntInput.Search>) {
  return <AntInput.Search {...props} />;
}

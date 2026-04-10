/**
 * UICheckbox component - Checkbox input
 *
 * Wraps Ant Design Checkbox with group support.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Checkbox as AntCheckbox } from 'antd';
import { UIBox, type UIBoxSpacingValue } from '../primitives/UIBox';
import { UIText } from '../primitives/UIText';
import { spacing } from '@kb-labs/studio-ui-core';

export interface UICheckboxOption {
  /** Option label */
  label: string;
  /** Option value */
  value: string | number;
  /** Disabled option */
  disabled?: boolean;
  /** Option description */
  description?: string;
}

export interface UICheckboxProps {
  /** Checkbox label */
  children?: React.ReactNode;
  /** Checked state */
  checked?: boolean;
  /** Default checked state */
  defaultChecked?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Indeterminate state */
  indeterminate?: boolean;
  /** Change handler (returns checked boolean) */
  onChange?: (checked: boolean) => void;
}

export interface UICheckboxGroupProps {
  /** Checkbox options */
  options: UICheckboxOption[];
  /** Selected values */
  value?: (string | number)[];
  /** Default selected values */
  defaultValue?: (string | number)[];
  /** Disabled state */
  disabled?: boolean;
  /** Gap between checkboxes (spacing token) */
  gap?: UIBoxSpacingValue;
  /** Change handler (returns array of values) */
  onChange?: (values: (string | number)[]) => void;
}

/**
 * UICheckbox - Single checkbox
 *
 * @example
 * ```tsx
 * <UICheckbox checked onChange={(checked) => console.log(checked)}>
 *   Accept terms
 * </UICheckbox>
 *
 * <UICheckbox indeterminate>Select all</UICheckbox>
 * ```
 */
export function UICheckbox({
  children,
  checked,
  defaultChecked,
  disabled,
  indeterminate,
  onChange,
  ...rest
}: UICheckboxProps) {
  const handleChange = (e: any) => {
    onChange?.(e.target.checked);
  };

  return (
    <AntCheckbox
      checked={checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      indeterminate={indeterminate}
      onChange={handleChange}
      {...rest}
    >
      {children}
    </AntCheckbox>
  );
}

/**
 * UICheckboxGroup - Checkbox group
 *
 * @example
 * ```tsx
 * <UICheckboxGroup
 *   options={[
 *     { label: 'Option 1', value: 1 },
 *     { label: 'Option 2', value: 2, description: 'With description' },
 *   ]}
 *   gap={3}
 *   onChange={(values) => console.log(values)}
 * />
 * ```
 */
export function UICheckboxGroup({
  options,
  value,
  defaultValue,
  disabled,
  gap = 2,
  onChange,
}: UICheckboxGroupProps) {
  return (
    <AntCheckbox.Group value={value} defaultValue={defaultValue} disabled={disabled} onChange={onChange}>
      <UIBox>
        {options.map((option, index) => (
          <UIBox key={option.value} mb={index < options.length - 1 ? gap : 0}>
            <AntCheckbox value={option.value} disabled={option.disabled}>
              {option.label}
            </AntCheckbox>
            {option.description && (
              <UIText
                size="sm"
                color="secondary"
                as="div"
                style={{ marginLeft: spacing[6], marginTop: spacing[1] }}
              >
                {option.description}
              </UIText>
            )}
          </UIBox>
        ))}
      </UIBox>
    </AntCheckbox.Group>
  );
}

/**
 * UIForm component - Form wrapper with validation
 *
 * Wraps Ant Design Form with consistent layout.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Form as AntForm } from 'antd';
import type { FormProps as AntFormProps, FormItemProps as AntFormItemProps } from 'antd';

export type UIFormLayout = 'horizontal' | 'vertical' | 'inline';

export interface UIFormProps extends AntFormProps {
  /** Form layout */
  layout?: UIFormLayout;
  /** Submit handler */
  onFinish?: (values: any) => void;
  /** Failed submit handler */
  onFinishFailed?: (errorInfo: any) => void;
  /** Initial form values */
  initialValues?: Record<string, any>;
  /** Form content */
  children: React.ReactNode;
}

/**
 * UIForm - Form wrapper
 *
 * @example
 * ```tsx
 * <UIForm layout="vertical" onFinish={handleSubmit}>
 *   <UIFormItem label="Username" name="username" rules={[{ required: true }]}>
 *     <UIInput />
 *   </UIFormItem>
 *   <UIFormItem>
 *     <UIButton variant="primary" htmlType="submit">Submit</UIButton>
 *   </UIFormItem>
 * </UIForm>
 * ```
 */
export function UIForm({
  layout = 'vertical',
  onFinish,
  onFinishFailed,
  initialValues,
  children,
  ...rest
}: UIFormProps) {
  return (
    <AntForm
      layout={layout}
      onFinish={onFinish}
      onFinishFailed={onFinishFailed}
      initialValues={initialValues}
      {...rest}
    >
      {children}
    </AntForm>
  );
}

/**
 * UIFormItem - Form field wrapper
 *
 * @example
 * ```tsx
 * <UIFormItem
 *   label="Email"
 *   name="email"
 *   rules={[
 *     { required: true, message: 'Please enter email' },
 *     { type: 'email', message: 'Please enter valid email' }
 *   ]}
 * >
 *   <UIInput type="email" />
 * </UIFormItem>
 * ```
 */
export function UIFormItem(props: AntFormItemProps) {
  return <AntForm.Item {...props} />;
}

/**
 * useForm hook - Form instance hook
 */
export const useUIForm = AntForm.useForm;

/**
 * UIFormList - Dynamic form list
 */
export function UIFormList(props: React.ComponentProps<typeof AntForm.List>) {
  return <AntForm.List {...props} />;
}

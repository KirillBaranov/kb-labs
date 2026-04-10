/**
 * UIInputNumber component - Numeric input
 *
 * Wraps Ant Design InputNumber for numeric value entry.
 */

import * as React from 'react';
import { InputNumber as AntInputNumber, type InputNumberProps as AntInputNumberProps } from 'antd';

export interface UIInputNumberProps extends AntInputNumberProps {}

export function UIInputNumber(props: UIInputNumberProps) {
  return <AntInputNumber {...props} />;
}

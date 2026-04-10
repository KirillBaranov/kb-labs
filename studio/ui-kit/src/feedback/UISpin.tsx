/**
 * UISpin component - Loading spinner
 *
 * Wraps Ant Design Spin for loading states.
 */

import * as React from 'react';
import { Spin as AntSpin, type SpinProps as AntSpinProps } from 'antd';

export interface UISpinProps extends AntSpinProps {}

export function UISpin(props: UISpinProps) {
  return <AntSpin {...props} />;
}

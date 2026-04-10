/**
 * UIDivider component - Visual separator
 *
 * Wraps Ant Design Divider.
 */

import * as React from 'react';
import { Divider as AntDivider, type DividerProps as AntDividerProps } from 'antd';

export interface UIDividerProps extends AntDividerProps {}

export function UIDivider(props: UIDividerProps) {
  return <AntDivider {...props} />;
}

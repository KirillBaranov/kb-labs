/**
 * UIPopconfirm component - Confirmation popover
 *
 * Wraps Ant Design Popconfirm for inline confirmations.
 */

import * as React from 'react';
import { Popconfirm as AntPopconfirm, type PopconfirmProps as AntPopconfirmProps } from 'antd';

export interface UIPopconfirmProps extends AntPopconfirmProps {}

export function UIPopconfirm(props: UIPopconfirmProps) {
  return <AntPopconfirm {...props} />;
}

/**
 * UIRow / UICol components - Grid layout
 *
 * Wraps Ant Design Row/Col for responsive grid layouts.
 */

import * as React from 'react';
import { Row as AntRow, Col as AntCol, type RowProps as AntRowProps, type ColProps as AntColProps } from 'antd';

export interface UIRowProps extends AntRowProps {}
export interface UIColProps extends AntColProps {}

export function UIRow(props: UIRowProps) {
  return <AntRow {...props} />;
}

export function UICol(props: UIColProps) {
  return <AntCol {...props} />;
}

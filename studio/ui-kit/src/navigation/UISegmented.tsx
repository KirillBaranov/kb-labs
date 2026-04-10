/**
 * UISegmented component - Segmented control
 *
 * Wraps Ant Design Segmented for tab-like selection.
 */

import * as React from 'react';
import { Segmented as AntSegmented, type SegmentedProps as AntSegmentedProps } from 'antd';

export interface UISegmentedProps extends AntSegmentedProps {}

export function UISegmented(props: UISegmentedProps) {
  return <AntSegmented {...props} />;
}

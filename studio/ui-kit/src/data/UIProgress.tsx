/**
 * UIProgress component - Progress indicator
 *
 * Wraps Ant Design Progress for displaying completion status.
 */

import * as React from 'react';
import { Progress as AntProgress, type ProgressProps as AntProgressProps } from 'antd';

export interface UIProgressProps extends AntProgressProps {}

export function UIProgress(props: UIProgressProps) {
  return <AntProgress {...props} />;
}

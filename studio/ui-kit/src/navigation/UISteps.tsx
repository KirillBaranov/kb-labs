/**
 * UISteps component - Step indicator
 *
 * Wraps Ant Design Steps for multi-step processes.
 */

import * as React from 'react';
import { Steps as AntSteps, type StepsProps as AntStepsProps } from 'antd';

export interface UIStepsProps extends AntStepsProps {}

export function UISteps(props: UIStepsProps) {
  return <AntSteps {...props} />;
}

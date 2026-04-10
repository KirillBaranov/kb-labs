/**
 * UIResult component - Result page
 *
 * Wraps Ant Design Result for success/error/info pages.
 */

import * as React from 'react';
import { Result as AntResult, type ResultProps as AntResultProps } from 'antd';

export interface UIResultProps extends AntResultProps {}

export function UIResult(props: UIResultProps) {
  return <AntResult {...props} />;
}

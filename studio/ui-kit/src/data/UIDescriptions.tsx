/**
 * UIDescriptions component - Description list
 *
 * Wraps Ant Design Descriptions for displaying key-value pairs.
 */

import * as React from 'react';
import { Descriptions as AntDescriptions, type DescriptionsProps as AntDescriptionsProps } from 'antd';

export interface UIDescriptionsProps extends AntDescriptionsProps {}

export function UIDescriptions(props: UIDescriptionsProps) {
  return <AntDescriptions {...props} />;
}

export function UIDescriptionsItem(props: React.ComponentProps<typeof AntDescriptions.Item>) {
  return <AntDescriptions.Item {...props} />;
}

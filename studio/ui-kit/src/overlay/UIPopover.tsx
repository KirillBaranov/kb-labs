/**
 * UIPopover component - Popover overlay
 *
 * Wraps Ant Design Popover for floating content.
 */

import * as React from 'react';
import { Popover as AntPopover, type PopoverProps as AntPopoverProps } from 'antd';

export interface UIPopoverProps extends AntPopoverProps {}

export function UIPopover(props: UIPopoverProps) {
  return <AntPopover {...props} />;
}

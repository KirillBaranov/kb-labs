/**
 * UIDropdown component - Dropdown menu
 *
 * Wraps Ant Design Dropdown.
 */

import * as React from 'react';
import { Dropdown as AntDropdown, type DropdownProps as AntDropdownProps } from 'antd';

export interface UIDropdownProps extends AntDropdownProps {}

export function UIDropdown(props: UIDropdownProps) {
  return <AntDropdown {...props} />;
}

export function UIDropdownButton(props: React.ComponentProps<typeof AntDropdown.Button>) {
  return <AntDropdown.Button {...props} />;
}

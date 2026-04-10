/**
 * UIRadio component - Radio button
 *
 * Wraps Ant Design Radio and Radio.Group.
 */

import * as React from 'react';
import { Radio as AntRadio, type RadioProps as AntRadioProps, type RadioGroupProps as AntRadioGroupProps } from 'antd';

export interface UIRadioProps extends AntRadioProps {}
export interface UIRadioGroupProps extends AntRadioGroupProps {}

export function UIRadio(props: UIRadioProps) {
  return <AntRadio {...props} />;
}

export function UIRadioGroup(props: UIRadioGroupProps) {
  return <AntRadio.Group {...props} />;
}


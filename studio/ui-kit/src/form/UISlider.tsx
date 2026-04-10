/**
 * UISlider component - Slider input
 *
 * Wraps Ant Design Slider.
 */

import * as React from 'react';
import { Slider as AntSlider, type SliderSingleProps } from 'antd';

export interface UISliderProps extends SliderSingleProps {}

export function UISlider(props: UISliderProps) {
  return <AntSlider {...props} />;
}

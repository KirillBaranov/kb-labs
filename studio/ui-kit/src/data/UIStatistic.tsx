/**
 * UIStatistic component - Statistic display
 *
 * Wraps Ant Design Statistic for displaying numeric values with titles.
 */

import * as React from 'react';
import { Statistic as AntStatistic, type StatisticProps as AntStatisticProps } from 'antd';

export interface UIStatisticProps extends AntStatisticProps {}

export function UIStatistic(props: UIStatisticProps) {
  return <AntStatistic {...props} />;
}

export function UIStatisticCountdown(props: React.ComponentProps<typeof AntStatistic.Countdown>) {
  return <AntStatistic.Countdown {...props} />;
}

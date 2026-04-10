/**
 * UITimeline component - Timeline display
 *
 * Wraps Ant Design Timeline for displaying chronological events.
 */

import * as React from 'react';
import { Timeline as AntTimeline, type TimelineProps as AntTimelineProps } from 'antd';

export interface UITimelineProps extends AntTimelineProps {}

export function UITimeline(props: UITimelineProps) {
  return <AntTimeline {...props} />;
}

export function UITimelineItem(props: React.ComponentProps<typeof AntTimeline.Item>) {
  return <AntTimeline.Item {...props} />;
}

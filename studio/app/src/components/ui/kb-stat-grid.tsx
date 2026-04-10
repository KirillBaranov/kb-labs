import * as React from 'react';
import { UIRow, UICol } from '@kb-labs/studio-ui-kit';

export interface KBStatGridProps {
  columns?: number;
  children: React.ReactNode;
}

export function KBStatGrid({ columns = 4, children }: KBStatGridProps) {
  const span = 24 / columns;

  return (
    <UIRow gutter={[16, 16]}>
      {React.Children.map(children, (child, index) => (
        <UICol span={span} key={index}>
          {child}
        </UICol>
      ))}
    </UIRow>
  );
}


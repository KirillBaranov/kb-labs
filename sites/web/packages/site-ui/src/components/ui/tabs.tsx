'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

export interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultId?: string;
  className?: string;
}

export function Tabs({ items, defaultId, className }: TabsProps) {
  const [activeId, setActiveId] = React.useState<string>(
    defaultId ?? items[0]?.id ?? ''
  );

  const activeItem = items.find((item) => item.id === activeId);

  return (
    <div className={cn('w-full', className)}>
      <div className="border-b border-line flex gap-0">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              onClick={() => setActiveId(item.id)}
              className={cn(
                'bg-transparent border-0 outline-none cursor-pointer px-4 py-2.5 text-sm font-medium transition-colors duration-150 -mb-px border-b-2',
                isActive
                  ? 'border-kb-text text-kb-text'
                  : 'border-transparent text-muted hover:text-kb-text'
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="pt-4">{activeItem?.content}</div>
    </div>
  );
}

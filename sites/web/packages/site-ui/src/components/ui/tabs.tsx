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
  /** Visual style. "underline" — default line tabs. "card" — pill tabs in a bordered card. */
  variant?: 'underline' | 'card';
  /** Extra element rendered on the right side of the tab bar (e.g. a filename label). */
  extra?: React.ReactNode;
  /** Class applied to the content area (e.g. fixed height + overflow). */
  contentClassName?: string;
}

export function Tabs({ items, defaultId, className, variant = 'underline', extra, contentClassName }: TabsProps) {
  const [activeId, setActiveId] = React.useState<string>(
    defaultId ?? items[0]?.id ?? ''
  );

  const activeItem = items.find((item) => item.id === activeId);

  if (variant === 'card') {
    return (
      <div className={cn('overflow-hidden rounded-2xl border border-line bg-bg shadow-card', className)}>
        {/* Tab bar */}
        <div role="tablist" className="flex items-center gap-0.5 border-b border-line bg-surface px-4 py-2">
          {items.map((item) => {
            const isActive = item.id === activeId;
            return (
              <button
                key={item.id}
                role="tab"
                id={`tab-card-${item.id}`}
                aria-selected={isActive}
                aria-controls={`panel-card-${item.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveId(item.id)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[0.82rem] font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-kb-text text-surface'
                    : 'text-muted/60 hover:text-muted'
                )}
              >
                {item.label}
              </button>
            );
          })}
          {extra && <span className="ml-auto">{extra}</span>}
        </div>
        {/* Content */}
        <div
          role="tabpanel"
          id={`panel-card-${activeId}`}
          aria-labelledby={`tab-card-${activeId}`}
          className={cn('overflow-auto', contentClassName)}
        >
          {activeItem?.content}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      <div role="tablist" className="border-b border-line flex gap-0">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${item.id}`}
              tabIndex={isActive ? 0 : -1}
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
        {extra && <span className="ml-auto flex items-center">{extra}</span>}
      </div>
      <div
        role="tabpanel"
        id={`panel-${activeId}`}
        aria-labelledby={`tab-${activeId}`}
        className="pt-4"
      >
        {activeItem?.content}
      </div>
    </div>
  );
}

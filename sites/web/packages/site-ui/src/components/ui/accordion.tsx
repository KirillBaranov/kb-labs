'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface AccordionItem {
  id: string;
  question: string;
  answer: string | React.ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  className?: string;
}

export function Accordion({ items, className }: AccordionProps) {
  const [openId, setOpenId] = React.useState<string | null>(null);

  return (
    <div className={cn('w-full', className)}>
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div key={item.id} className="border-b border-line">
            <button
              onClick={() => setOpenId(isOpen ? null : item.id)}
              className="flex justify-between items-center py-4 w-full text-left bg-transparent border-0 outline-none cursor-pointer text-kb-text font-medium hover:text-kb-text/80 transition-colors duration-150"
            >
              <span>{item.question}</span>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-muted transition-transform duration-300',
                  isOpen && 'rotate-180'
                )}
              />
            </button>
            <div
              className={cn(
                'overflow-hidden transition-all duration-300',
                isOpen ? 'max-h-[500px]' : 'max-h-0'
              )}
            >
              <div className="pb-4 text-muted text-sm leading-relaxed">
                {item.answer}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

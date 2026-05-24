'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import * as React from 'react';
import { useTheme } from '../../hooks/useTheme';
import { cn } from '../../lib/utils';

export type ThemeToggleProps = {
  className?: string;
};

const ICONS = {
  light:  <Sun size={16} />,
  dark:   <Moon size={16} />,
  system: <Monitor size={16} />,
} as const;

const NEXT_LABEL = {
  light:  'Switch to dark theme',
  dark:   'Switch to system theme',
  system: 'Switch to light theme',
} as const;

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { preference, toggleTheme, mounted } = useTheme();

  const btnClass = cn(
    'inline-flex size-9 items-center justify-center rounded-md border-0 outline-none ring-1 ring-inset ring-line bg-surface',
    'text-muted transition-colors duration-150',
    'hover:ring-line-strong hover:text-kb-text',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
    className
  );

  if (!mounted) {
    return <button aria-label="Toggle theme" className={btnClass} />;
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label={NEXT_LABEL[preference]}
      title={preference}
      className={btnClass}
    >
      {ICONS[preference]}
    </button>
  );
}

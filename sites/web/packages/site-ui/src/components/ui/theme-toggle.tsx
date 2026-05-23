'use client';

import { Moon, Sun } from 'lucide-react';
import * as React from 'react';
import { useTheme } from '../../hooks/useTheme';
import { cn } from '../../lib/utils';

export type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme, mounted } = useTheme();

  if (!mounted) {
    return (
      <button
        aria-label="Toggle theme"
        className={cn(
          'inline-flex size-9 items-center justify-center rounded-md border-0 outline-none ring-1 ring-inset ring-line bg-surface',
          'text-muted transition-colors hover:ring-line-strong hover:text-kb-text',
          className
        )}
      />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-md border-0 outline-none cursor-pointer ring-1 ring-inset ring-line bg-surface',
        'text-muted transition-colors duration-150',
        'hover:ring-line-strong hover:text-kb-text',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        className
      )}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

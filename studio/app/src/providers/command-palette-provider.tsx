/**
 * @module @kb-labs/studio-app/providers/command-palette-provider
 * Command Palette provider - manages commands and quick search
 */

import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { UIMessage } from '@kb-labs/studio-ui-kit';
import { useQueryClient } from '@tanstack/react-query';
import { useDataSources } from './data-sources-provider';
import { useSettings } from './settings-provider';
import { getCommands, saveRecentCommand, getRecentCommands } from '@/utils/commands';
import { KBQuickSearch, type SearchableItem } from '@/components/ui';

interface CommandPaletteContextValue {
  /** Open command palette */
  open: () => void;
  /** Close command palette */
  close: () => void;
  /** Toggle command palette */
  toggle: () => void;
  /** Check if palette is open */
  isOpen: boolean;
}

const CommandPaletteContext = React.createContext<CommandPaletteContextValue | undefined>(
  undefined
);

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const refresh = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['studio-registry-v2'] }),
    [queryClient],
  );
  const sources = useDataSources();

  // Commands configuration
  const allCommands = React.useMemo(
    () =>
      getCommands({
        navigate,
        toggleTheme: () => {
          const currentTheme = settings.appearance.theme;
          const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
          updateSettings({ appearance: { ...settings.appearance, theme: newTheme } });
          UIMessage.success(`Switched to ${newTheme} mode`);
        },
        refreshRegistry: async () => {
          try {
            await refresh();
            UIMessage.success('Registry refreshed successfully');
          } catch (error) {
            UIMessage.error(
              `Failed to refresh registry: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        },
        invalidateCache: async () => {
          try {
            const result = await sources.cache.invalidateCache();
            UIMessage.success(
              `Cache invalidated! Rev: ${result.previousRev ?? 'N/A'} → ${result.newRev}`
            );
            await refresh();
          } catch (error) {
            UIMessage.error(
              `Failed to invalidate cache: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        },
        openQuickSearch: () => {
          setIsOpen(true);
        },
      }),
    [navigate, settings, updateSettings, refresh, sources]
  );

  // Get recent commands and merge with all commands
  const items = React.useMemo(() => {
    const recentIds = getRecentCommands();
    const recentCommands: SearchableItem[] = [];
    const otherCommands: SearchableItem[] = [];

    allCommands.forEach((cmd) => {
      const item: SearchableItem = {
        id: cmd.id,
        title: cmd.title,
        description: cmd.description,
        category: cmd.category as SearchableItem['category'],
        path: cmd.path,
        icon: undefined, // Explicitly set to undefined - icons will be rendered based on category
        badge: cmd.shortcut,
      };

      if (recentIds.includes(cmd.id)) {
        recentCommands.push(item);
      } else {
        otherCommands.push(item);
      }
    });

    // Sort recent by recency, others by priority
    const sortedRecent = recentCommands.sort(
      (a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id)
    );

    const sortedOthers = otherCommands.sort((a, b) => {
      const cmdA = allCommands.find((c) => c.id === a.id);
      const cmdB = allCommands.find((c) => c.id === b.id);
      return (cmdB?.priority ?? 0) - (cmdA?.priority ?? 0);
    });

    return [...sortedRecent, ...sortedOthers];
  }, [allCommands]);

  // Handle command execution
  const handleNavigate = React.useCallback(
    (path: string) => {
      const command = allCommands.find((cmd) => cmd.path === path);
      if (!command) {return;}

      // Save to recent
      saveRecentCommand(command.id);

      // Execute action or navigate
      if (command.action) {
        command.action();
      } else if (command.path) {
        // Handle URL params (e.g., /settings?tab=appearance)
        if (command.path.includes('?')) {
          const [basePath, search] = command.path.split('?');
          navigate({ pathname: basePath, search: `?${search}` });
        } else {
          navigate(command.path);
        }
      }

      setIsOpen(false);
    },
    [allCommands, navigate]
  );

  // Keyboard shortcut: Cmd+K / Ctrl+K
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const value = React.useMemo(
    () => ({
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((prev) => !prev),
      isOpen,
    }),
    [isOpen]
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <KBQuickSearch
        open={isOpen}
        onClose={() => setIsOpen(false)}
        items={items}
        onNavigate={handleNavigate}
        placeholder="Search pages, run commands..."
      />
    </CommandPaletteContext.Provider>
  );
}

/**
 * Hook to use command palette
 */
export function useCommandPalette() {
  const context = React.useContext(CommandPaletteContext);
  if (!context) {
    throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  }
  return context;
}

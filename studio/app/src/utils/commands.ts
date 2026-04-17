/**
 * @module @kb-labs/studio-app/utils/commands
 * Centralized command registry for Command Palette
 */

import { studioConfig } from '@/config/studio.config';

export type CommandCategory = 'recent' | 'navigation' | 'action' | 'plugin' | 'widget' | 'setting';

export interface Command {
  id: string;
  title: string;
  description?: string;
  category: CommandCategory;
  path: string;
  /** Action to execute (alternative to path for navigation) */
  action?: () => void | Promise<void>;
  /** Keyboard shortcut */
  shortcut?: string;
  /** Tags for better search */
  tags?: string[];
  /** Priority for sorting (higher = shown first) */
  priority?: number;
}

export interface CommandsConfig {
  navigate: (path: string) => void;
  toggleTheme: () => void;
  refreshRegistry: () => Promise<void>;
  invalidateCache: () => Promise<void>;
  openQuickSearch: () => void;
}

/**
 * Get all available commands for Command Palette
 */
export function getCommands(config: CommandsConfig): Command[] {
  const { toggleTheme, refreshRegistry, invalidateCache, openQuickSearch } = config;

  return [
    // ============================================
    // NAVIGATION COMMANDS
    // ============================================
    {
      id: 'nav-dashboard',
      title: 'Go to Dashboard',
      description: 'View main dashboard',
      category: 'navigation' as const,
      path: '/',
      tags: ['home', 'main', 'overview'],
      priority: 100,
    },
    {
      id: 'nav-observability',
      title: 'Go to Observability',
      description: 'View system observability',
      category: 'navigation' as const,
      path: '/observability',
      tags: ['monitoring', 'metrics', 'logs'],
      priority: 90,
    },
    {
      id: 'nav-observability-events',
      title: 'Go to System Events',
      description: 'View system event log',
      category: 'navigation' as const,
      path: '/observability/system-events',
      tags: ['events', 'logs', 'history'],
      priority: 85,
    },
    {
      id: 'nav-observability-registry',
      title: 'Go to Registry Browser',
      description: 'Browse plugin registry',
      category: 'navigation' as const,
      path: '/observability/registry',
      tags: ['plugins', 'registry', 'browse'],
      priority: 80,
    },
    {
      id: 'nav-settings',
      title: 'Go to Settings',
      description: 'Configure application settings',
      category: 'navigation' as const,
      path: '/settings',
      tags: ['preferences', 'config', 'configuration'],
      shortcut: 'Cmd+,',
      priority: 95,
    },
    {
      id: 'nav-settings-appearance',
      title: 'Go to Appearance Settings',
      description: 'Change theme and appearance',
      category: 'navigation' as const,
      path: '/settings?tab=appearance',
      tags: ['theme', 'dark mode', 'colors'],
      priority: 70,
    },
    {
      id: 'nav-settings-experimental',
      title: 'Go to Experimental Features',
      description: 'Enable experimental features',
      category: 'navigation' as const,
      path: '/settings?tab=experimental',
      tags: ['features', 'flags', 'beta'],
      priority: 65,
    },
    {
      id: 'nav-settings-developer',
      title: 'Go to Developer Tools',
      description: 'Developer settings and tools',
      category: 'navigation' as const,
      path: '/settings?tab=developer',
      tags: ['dev', 'debug', 'tools'],
      priority: 60,
    },

    // ============================================
    // ACTION COMMANDS
    // ============================================
    {
      id: 'action-toggle-theme',
      title: 'Toggle Dark Mode',
      description: 'Switch between light and dark theme',
      category: 'action' as const,
      path: '',
      action: toggleTheme,
      tags: ['theme', 'dark', 'light', 'appearance'],
      shortcut: 'Cmd+Shift+T',
      priority: 90,
    },
    {
      id: 'action-refresh-registry',
      title: 'Refresh Registry',
      description: 'Fetch latest registry data',
      category: 'action' as const,
      path: '',
      action: refreshRegistry,
      tags: ['refresh', 'reload', 'update'],
      shortcut: 'Cmd+R',
      priority: 85,
    },
    {
      id: 'action-invalidate-cache',
      title: 'Invalidate Cache & Re-discover',
      description: 'Force full plugin re-discovery',
      category: 'action' as const,
      path: '',
      action: invalidateCache,
      tags: ['cache', 'clear', 'discover', 'plugins'],
      priority: 80,
    },
    {
      id: 'action-quick-search',
      title: 'Open Quick Search',
      description: 'Search pages and plugins',
      category: 'action' as const,
      path: '',
      action: openQuickSearch,
      tags: ['search', 'find'],
      shortcut: 'Cmd+K',
      priority: 100,
    },
    {
      id: 'action-copy-registry-url',
      title: 'Copy Registry URL',
      description: 'Copy REST API registry endpoint',
      category: 'action' as const,
      path: '',
      action: () => {
        const apiBase = studioConfig.apiBaseUrl.replace(/\/+$/, '');
        const url = `${apiBase}/studio/registry`;
        navigator.clipboard.writeText(url);
      },
      tags: ['copy', 'url', 'api'],
      priority: 50,
    },

    // ============================================
    // SETTING COMMANDS
    // ============================================
    {
      id: 'setting-appearance',
      title: 'Appearance Settings',
      description: 'Theme, colors, and visual preferences',
      category: 'setting' as const,
      path: '/settings?tab=appearance',
      tags: ['theme', 'dark mode', 'colors', 'visual'],
      priority: 70,
    },
    {
      id: 'setting-privacy',
      title: 'Data & Privacy Settings',
      description: 'Privacy and data management',
      category: 'setting' as const,
      path: '/settings?tab=privacy',
      tags: ['privacy', 'data', 'security'],
      priority: 65,
    },
    {
      id: 'setting-system',
      title: 'System Information',
      description: 'View system health and status',
      category: 'setting' as const,
      path: '/settings?tab=system',
      tags: ['health', 'status', 'info'],
      priority: 60,
    },
    {
      id: 'setting-developer',
      title: 'Developer Settings',
      description: 'Development tools and debugging',
      category: 'setting' as const,
      path: '/settings?tab=developer',
      tags: ['dev', 'debug', 'tools'],
      priority: 55,
    },
  ];
}

/**
 * Get recent commands from localStorage
 */
export function getRecentCommands(): string[] {
  try {
    const stored = localStorage.getItem('kb-recent-commands');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save command to recent history
 */
export function saveRecentCommand(commandId: string): void {
  try {
    const recent = getRecentCommands();
    const updated = [commandId, ...recent.filter((id) => id !== commandId)].slice(0, 5);
    localStorage.setItem('kb-recent-commands', JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save recent command:', error);
  }
}

/**
 * Clear recent commands history
 */
export function clearRecentCommands(): void {
  try {
    localStorage.removeItem('kb-recent-commands');
  } catch (error) {
    console.error('Failed to clear recent commands:', error);
  }
}

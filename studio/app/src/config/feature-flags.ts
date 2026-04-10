/**
 * @module @kb-labs/studio-app/config/feature-flags
 * Feature flags for experimental features
 */

export type FeatureId =
  // UI/UX Features
  | 'command-palette'
  | 'page-transitions'
  | 'toast-notifications'
  | 'bulk-actions'
  | 'context-menu'
  | 'drag-drop'
  | 'keyboard-shortcuts-overlay'
  | 'split-view'
  | 'minimap'
  | 'breadcrumb-history'
  | 'floating-action-button'
  // Developer Tools
  | 'devtools-panel'
  // Performance Features
  | 'virtual-scrolling'
  | 'lazy-loading'
  | 'code-splitting'
  | 'prefetching'
  | 'service-worker'
  | 'websocket-connection'
  // AI Features
  | 'ai-suggestions'
  | 'natural-language-search'
  | 'auto-complete'
  | 'smart-insights'
  // Data Features
  | 'offline-mode'
  | 'auto-save'
  | 'collaborative-editing'
  | 'version-history'
  | 'real-time-sync';

export type FeatureGroup =
  | 'ui-ux'
  | 'performance'
  | 'ai'
  | 'data';

export type FeatureStatus = 'alpha' | 'beta' | 'stable' | 'deprecated';

export type FeatureRisk = 'low' | 'medium' | 'high';

export interface FeatureFlag {
  id: FeatureId;
  name: string;
  description: string;
  group: FeatureGroup;
  status: FeatureStatus;
  risk: FeatureRisk;
  enabled: boolean;
  /** Default value when no user preference is set */
  defaultEnabled: boolean;
  /** Long-form details shown in tooltip */
  details?: string;
  /** Related features that might affect this one */
  dependencies?: FeatureId[];
  /** When this feature was added (for "New" badge) */
  addedAt?: string;
  /** If deprecated, when it will be removed */
  deprecatedAt?: string;
}

export const FEATURE_FLAGS: Record<FeatureId, FeatureFlag> = {
  // UI/UX Features
  'command-palette': {
    id: 'command-palette',
    name: 'Command Palette',
    description: 'Quick actions via Cmd/Ctrl+K (like VS Code)',
    details: 'Global keyboard shortcut (Cmd/Ctrl+K) to search and execute commands quickly. Includes fuzzy search, recent actions, and keyboard navigation.',
    group: 'ui-ux',
    status: 'alpha',
    risk: 'low',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'page-transitions': {
    id: 'page-transitions',
    name: 'Page Transitions',
    description: 'Smooth animations when switching between pages',
    details: 'Subtle page transition animations (fade, slide) when navigating between routes. Can be customized or disabled in Dashboard settings.',
    group: 'ui-ux',
    status: 'beta',
    risk: 'low',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'toast-notifications': {
    id: 'toast-notifications',
    name: 'Toast Notifications',
    description: 'Non-blocking notifications for background tasks',
    details: 'Lightweight toast notifications in the bottom-right corner. Better UX than blocking modals for non-critical events.',
    group: 'ui-ux',
    status: 'alpha',
    risk: 'low',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'bulk-actions': {
    id: 'bulk-actions',
    name: 'Bulk Actions',
    description: 'Select and act on multiple items at once',
    details: 'Multi-select checkboxes in tables with bulk operations (delete, archive, export). Includes "Select All" and partial selection indicators.',
    group: 'ui-ux',
    status: 'alpha',
    risk: 'medium',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'context-menu': {
    id: 'context-menu',
    name: 'Context Menu',
    description: 'Right-click context menus for quick actions',
    details: 'Right-click context menus throughout the app for contextual actions. Reduces clicks and improves discoverability.',
    group: 'ui-ux',
    status: 'alpha',
    risk: 'low',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'drag-drop': {
    id: 'drag-drop',
    name: 'Drag & Drop',
    description: 'Drag and drop for reordering and organizing',
    details: 'Drag and drop support for reordering lists, moving items between sections, and file uploads. Uses react-dnd for accessibility.',
    group: 'ui-ux',
    status: 'beta',
    risk: 'medium',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'keyboard-shortcuts-overlay': {
    id: 'keyboard-shortcuts-overlay',
    name: 'Keyboard Shortcuts Overlay',
    description: 'Press "?" to see all keyboard shortcuts',
    details: 'Modal overlay showing all available keyboard shortcuts, grouped by context. Searchable and includes visual key indicators.',
    group: 'ui-ux',
    status: 'alpha',
    risk: 'low',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'split-view': {
    id: 'split-view',
    name: 'Split View',
    description: 'View two pages side-by-side',
    details: 'Split screen view to compare data, reference documentation, or work with multiple items simultaneously. Resizable panes.',
    group: 'ui-ux',
    status: 'beta',
    risk: 'medium',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'minimap': {
    id: 'minimap',
    name: 'Minimap',
    description: 'Code editor-style minimap for large pages',
    details: 'Minimap overview for scrolling long pages (like VS Code). Shows current viewport position and allows quick navigation.',
    group: 'ui-ux',
    status: 'alpha',
    risk: 'low',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'breadcrumb-history': {
    id: 'breadcrumb-history',
    name: 'Breadcrumb Navigation',
    description: 'Enhanced breadcrumbs with dropdown history',
    details: 'Breadcrumb navigation with clickable history dropdowns. Shows recent pages in each section for quick navigation.',
    group: 'ui-ux',
    status: 'beta',
    risk: 'low',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'floating-action-button': {
    id: 'floating-action-button',
    name: 'Floating Action Button',
    description: 'Quick access to primary actions',
    details: 'Floating action button (FAB) in the bottom-right for quick access to primary actions like "Create", "Upload", etc.',
    group: 'ui-ux',
    status: 'alpha',
    risk: 'low',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },

  // Developer Tools
  'devtools-panel': {
    id: 'devtools-panel',
    name: 'DevTools Panel',
    description: 'Developer debug panel in Settings → Developer tab',
    details: 'Captures Module Federation loading events (including missing default exports) and EventBus events. Only useful during plugin development.',
    group: 'performance',
    status: 'alpha',
    risk: 'low',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2026-04-02',
  },

  // Performance Features
  'virtual-scrolling': {
    id: 'virtual-scrolling',
    name: 'Virtual Scrolling',
    description: 'Render only visible items in large lists (10,000+ items)',
    details: 'Virtual scrolling for large tables and lists. Only renders visible rows, dramatically improving performance for datasets with 10,000+ items.',
    group: 'performance',
    status: 'beta',
    risk: 'medium',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'lazy-loading': {
    id: 'lazy-loading',
    name: 'Lazy Loading',
    description: 'Load images and components on demand',
    details: 'Lazy load images and heavy components only when they enter the viewport. Reduces initial page load time and bandwidth usage.',
    group: 'performance',
    status: 'beta',
    risk: 'low',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'code-splitting': {
    id: 'code-splitting',
    name: 'Code Splitting',
    description: 'Load JavaScript code on demand per route',
    details: 'Dynamic imports and code splitting to reduce initial bundle size. Routes load their JS only when visited.',
    group: 'performance',
    status: 'stable',
    risk: 'low',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'prefetching': {
    id: 'prefetching',
    name: 'Smart Prefetching',
    description: 'Prefetch data for likely next pages',
    details: 'Intelligently prefetch data for pages you are likely to visit next (based on hover, navigation patterns). Makes navigation instant.',
    group: 'performance',
    status: 'alpha',
    risk: 'medium',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'service-worker': {
    id: 'service-worker',
    name: 'Service Worker',
    description: 'Offline support and faster repeat visits',
    details: 'Service worker for offline support, background sync, and caching. Enables Progressive Web App (PWA) features.',
    group: 'performance',
    status: 'alpha',
    risk: 'high',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
    dependencies: ['offline-mode'],
  },
  'websocket-connection': {
    id: 'websocket-connection',
    name: 'WebSocket Connection',
    description: 'Real-time updates via WebSocket instead of polling',
    details: 'Replace polling with WebSocket connection for real-time updates. Lower latency, reduced server load, but requires backend support.',
    group: 'performance',
    status: 'alpha',
    risk: 'high',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },

  // AI Features
  'ai-suggestions': {
    id: 'ai-suggestions',
    name: 'AI Suggestions',
    description: 'AI-powered suggestions and auto-completion',
    details: 'AI-powered suggestions for forms, queries, and actions. Uses LLM to predict what you want to do next.',
    group: 'ai',
    status: 'alpha',
    risk: 'high',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'natural-language-search': {
    id: 'natural-language-search',
    name: 'Natural Language Search',
    description: 'Search using natural language queries',
    details: 'Search using plain English instead of filters. Example: "Show me workflows that failed last week" instead of complex filter UI.',
    group: 'ai',
    status: 'alpha',
    risk: 'medium',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'auto-complete': {
    id: 'auto-complete',
    name: 'Smart Auto-Complete',
    description: 'Context-aware auto-completion',
    details: 'Intelligent auto-completion for search, filters, and forms. Learns from your usage patterns.',
    group: 'ai',
    status: 'beta',
    risk: 'medium',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'smart-insights': {
    id: 'smart-insights',
    name: 'Smart Insights',
    description: 'AI-generated insights and recommendations',
    details: 'AI-generated insights about your data, trends, and anomalies. Proactive recommendations for optimization.',
    group: 'ai',
    status: 'alpha',
    risk: 'high',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },

  // Data Features
  'offline-mode': {
    id: 'offline-mode',
    name: 'Offline Mode',
    description: 'Work offline and sync when back online',
    details: 'Full offline support with background sync. Continue working without internet and changes sync automatically when reconnected.',
    group: 'data',
    status: 'alpha',
    risk: 'high',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
    dependencies: ['service-worker'],
  },
  'auto-save': {
    id: 'auto-save',
    name: 'Auto-Save',
    description: 'Automatically save changes every few seconds',
    details: 'Auto-save form changes every 3 seconds. Never lose work due to browser crashes or accidental navigation.',
    group: 'data',
    status: 'beta',
    risk: 'medium',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'collaborative-editing': {
    id: 'collaborative-editing',
    name: 'Collaborative Editing',
    description: 'Real-time collaboration with other users',
    details: 'See who else is viewing/editing the same data in real-time. Prevents conflicts and enables teamwork.',
    group: 'data',
    status: 'alpha',
    risk: 'high',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
    dependencies: ['websocket-connection'],
  },
  'version-history': {
    id: 'version-history',
    name: 'Version History',
    description: 'View and restore previous versions',
    details: 'Complete version history for all entities. View changes over time, compare versions, and restore previous states.',
    group: 'data',
    status: 'beta',
    risk: 'medium',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
  },
  'real-time-sync': {
    id: 'real-time-sync',
    name: 'Real-Time Sync',
    description: 'Sync changes instantly across all devices',
    details: 'Real-time synchronization across all your devices. Changes appear instantly everywhere.',
    group: 'data',
    status: 'alpha',
    risk: 'high',
    enabled: false,
    defaultEnabled: false,
    addedAt: '2025-12-31',
    dependencies: ['websocket-connection'],
  },
};

export const FEATURE_GROUPS: Record<FeatureGroup, { name: string; description: string; icon: string }> = {
  'ui-ux': {
    name: 'UI & UX',
    description: 'User interface and experience enhancements',
    icon: 'BgColorsOutlined',
  },
  performance: {
    name: 'Performance',
    description: 'Speed and efficiency improvements',
    icon: 'ThunderboltOutlined',
  },
  ai: {
    name: 'AI Features',
    description: 'AI-powered capabilities and intelligence',
    icon: 'RobotOutlined',
  },
  data: {
    name: 'Data & Sync',
    description: 'Data management and synchronization',
    icon: 'DatabaseOutlined',
  },
};

/** Get features grouped by category */
export function getFeaturesByGroup(): Record<FeatureGroup, FeatureFlag[]> {
  const grouped: Record<FeatureGroup, FeatureFlag[]> = {
    'ui-ux': [],
    performance: [],
    ai: [],
    data: [],
  };

  Object.values(FEATURE_FLAGS).forEach((flag) => {
    grouped[flag.group].push(flag);
  });

  return grouped;
}

/** Check if a feature is enabled based on user preferences */
export function isFeatureEnabled(
  featureId: FeatureId,
  userPreferences?: Record<FeatureId, boolean>
): boolean {
  const flag = FEATURE_FLAGS[featureId];
  if (!flag) {return false;}

  // If user has explicit preference, use that
  if (userPreferences && featureId in userPreferences) {
    return userPreferences[featureId];
  }

  // Otherwise use default
  return flag.defaultEnabled;
}

/** Get all enabled features */
export function getEnabledFeatures(userPreferences?: Record<FeatureId, boolean>): FeatureId[] {
  return Object.keys(FEATURE_FLAGS).filter((id) =>
    isFeatureEnabled(id as FeatureId, userPreferences)
  ) as FeatureId[];
}

/** Check if feature has dependencies and all are enabled */
export function areDependenciesMet(
  featureId: FeatureId,
  userPreferences?: Record<FeatureId, boolean>
): boolean {
  const flag = FEATURE_FLAGS[featureId];
  if (!flag.dependencies || flag.dependencies.length === 0) {return true;}

  return flag.dependencies.every((dep) => isFeatureEnabled(dep, userPreferences));
}

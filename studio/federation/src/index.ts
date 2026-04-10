// Loader
export { initFederation, syncRemoteEntry, loadPageComponent, PageLoadError, resetFederation } from './widget-loader.js';

// Components
export { PageContainer, type PageContainerProps } from './page-container.js';
export { PageErrorBoundary } from './page-error-boundary.js';
export { PluginErrorUI, type PluginErrorDetails } from './plugin-error-ui.js';

// Types
export type { StudioRegistryV2, StudioPluginEntryV2, StudioPageEntry, StudioMenuEntry } from './types.js';

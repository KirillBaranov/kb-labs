import { usePageContext, type PageContext } from './page-context.js';

/**
 * Access the current page context.
 *
 * @example
 * ```tsx
 * const { pageId, pluginId, permissions } = usePage();
 * ```
 */
export function usePage(): PageContext {
  return usePageContext();
}

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Page context — provided to every plugin page by the host.
 */
export interface PageContext {
  /** Page ID from the manifest */
  pageId: string;
  /** Plugin that owns this page */
  pluginId: string;
  /** Additional config passed to this page instance */
  config: Record<string, unknown>;
  /** User permissions applicable to this page */
  permissions: string[];
}

const PageCtx = createContext<PageContext | null>(null);

export interface PageContextProviderProps {
  children: ReactNode;
  value: PageContext;
}

export function PageContextProvider({ children, value }: PageContextProviderProps) {
  return <PageCtx.Provider value={value}>{children}</PageCtx.Provider>;
}

export function usePageContext(): PageContext {
  const ctx = useContext(PageCtx);
  if (!ctx) {
    throw new Error('usePage() must be used inside a PageContextProvider (are you inside a Studio page?)');
  }
  return ctx;
}

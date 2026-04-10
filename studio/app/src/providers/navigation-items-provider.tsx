/**
 * @module @kb-labs/studio-app/providers/navigation-items-provider
 * Provides the list of available sidebar navigation items to settings UI.
 * Single source of truth — no hardcoded item lists.
 */

import * as React from 'react';

export interface NavigationItemDescriptor {
  key: string;
  label: string;
}

interface NavigationItemsContextValue {
  availableItems: NavigationItemDescriptor[];
}

const NavigationItemsContext = React.createContext<NavigationItemsContextValue>({
  availableItems: [],
});

export interface NavigationItemsProviderProps {
  items: NavigationItemDescriptor[];
  children: React.ReactNode;
}

export function NavigationItemsProvider({ items, children }: NavigationItemsProviderProps) {
  const value = React.useMemo(() => ({ availableItems: items }), [items]);
  return (
    <NavigationItemsContext.Provider value={value}>
      {children}
    </NavigationItemsContext.Provider>
  );
}

export function useNavigationItems(): NavigationItemDescriptor[] {
  return React.useContext(NavigationItemsContext).availableItems;
}

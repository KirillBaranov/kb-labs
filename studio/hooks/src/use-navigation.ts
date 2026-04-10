import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export interface UseNavigationReturn {
  /** Navigate to a route */
  navigate: (path: string) => void;
  /** Current pathname */
  currentPath: string;
  /** Go back in history */
  goBack: () => void;
  /** Open external URL in new tab */
  openExternal: (url: string) => void;
}

/**
 * Navigation hook for plugin pages.
 *
 * @example
 * ```tsx
 * const { navigate, currentPath } = useNavigation();
 * navigate('/commit/history');
 * ```
 */
export function useNavigation(): UseNavigationReturn {
  const nav = useNavigate();
  const location = useLocation();

  const navigate = useCallback((path: string) => nav(path), [nav]);
  const goBack = useCallback(() => nav(-1), [nav]);
  const openExternal = useCallback((url: string) => window.open(url, '_blank', 'noopener'), []);

  return {
    navigate,
    currentPath: location.pathname,
    goBack,
    openExternal,
  };
}

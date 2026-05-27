import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RouterProvider } from 'react-router-dom';
import { KBConfigProvider } from '@/components/ui/kb-config-provider';
import { DataSourcesProvider } from './providers/data-sources-provider';
// Real auth provider (ADR-0020) replaces old localStorage-based fake.
// The old providers/auth-provider.tsx is kept for backward-compat during migration.
import { AuthProvider } from './auth/auth-provider';
import { RegistryV2Provider } from './providers/registry-v2-provider';
import { SettingsProvider } from './providers/settings-provider';
import { EventBusProvider } from '@kb-labs/studio-event-bus';
import { router } from './router';
import { studioConfig } from './config/studio.config';
import { DevToolsProvider } from './providers/devtools-provider';
import { DevToolsPanel } from './components/devtools/devtools-panel';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <KBConfigProvider defaultTheme="light" storageKey="studio-ui-theme">
      <SettingsProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <DataSourcesProvider>
              <DevToolsProvider>
                <RegistryV2Provider apiBaseUrl={studioConfig.apiBaseUrl}>
                  <EventBusProvider>
                    <RouterProvider router={router} />
                    <ReactQueryDevtools initialIsOpen={false} />
                  </EventBusProvider>
                </RegistryV2Provider>
                <DevToolsPanel />
              </DevToolsProvider>
            </DataSourcesProvider>
          </QueryClientProvider>
        </AuthProvider>
      </SettingsProvider>
    </KBConfigProvider>
  );
}

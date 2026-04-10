/**
 * Dynamic plugin page resolver.
 *
 * Studio router mounts this component at /p/*. Plugin page routes are declared
 * as absolute paths like /p/workflows/runs/:runId. We render them as a <Routes>
 * tree with relative paths (stripping the /p/ prefix) so React Router resolves
 * them correctly within the /p/* wildcard and sets useParams() for plugin pages.
 */

import * as React from 'react';
import { Routes, Route } from 'react-router-dom';
import { PageContainer } from '@kb-labs/studio-federation';
import { useRegistryV2 } from '../providers/registry-v2-provider';
import { NotFoundPage } from '../pages/not-found-page';

const P_PREFIX = /^\/p\//;

export function PluginPageV2() {
  const { registry, loading } = useRegistryV2();

  if (loading) {return null;}

  const allPages = registry.plugins.flatMap((plugin) =>
    plugin.pages.map((page) => ({ plugin, page })),
  );

  return (
    <Routes>
      {allPages.map(({ plugin, page }) => {
        // Strip /p/ prefix → relative path for <Routes> inside /p/*
        const relativePath = page.route.replace(P_PREFIX, '');
        return (
          <Route
            key={`${plugin.remoteName}::${page.entry}`}
            path={relativePath}
            element={
              <PageContainer
                remoteName={plugin.remoteName}
                entry={page.entry}
                remoteEntryUrl={plugin.remoteEntryUrl}
                pageId={page.id}
                pluginId={plugin.pluginId}
                permissions={page.permissions}
              />
            }
          />
        );
      })}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

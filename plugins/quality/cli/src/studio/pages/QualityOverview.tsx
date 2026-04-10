/**
 * QualityOverview — main Quality plugin page (Module Federation widget).
 * Tabbed view: Overview / Dependencies / Build Order / Graph / Stale Packages
 */

import * as React from 'react';
import { UIPage, UIPageHeader, UITabs } from '@kb-labs/sdk/studio';
import { OverviewTab } from '../components/OverviewTab';
import { DependenciesTab } from '../components/DependenciesTab';
import { BuildOrderTab } from '../components/BuildOrderTab';
import { GraphTab } from '../components/GraphTab';
import { StaleTab } from '../components/StaleTab';

export default function QualityOverview() {
  const tabs = (
    <UITabs
      syncUrl="search"
      items={[
        {
          key: 'overview',
          label: 'Overview',
          children: <OverviewTab />,
        },
        {
          key: 'dependencies',
          label: 'Dependencies',
          children: <DependenciesTab />,
        },
        {
          key: 'build-order',
          label: 'Build Order',
          children: <BuildOrderTab />,
        },
        {
          key: 'graph',
          label: 'Dependency Graph',
          children: <GraphTab />,
        },
        {
          key: 'stale',
          label: 'Stale Packages',
          children: <StaleTab />,
        },
      ]}
    />
  );

  return (
    <UIPage>
      <UIPageHeader
        title="Quality"
        description="Monorepo health metrics, dependency analysis, and build order visualization"
        tabs={tabs}
      />
    </UIPage>
  );
}

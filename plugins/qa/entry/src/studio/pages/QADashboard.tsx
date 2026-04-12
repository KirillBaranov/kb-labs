/**
 * QA plugin main page — build, lint, type check, and test results dashboard
 */

import { UIPage, UIPageHeader, UITabs } from '@kb-labs/sdk/studio';
import { OverviewTab } from '../components/OverviewTab';
import { HistoryTab } from '../components/HistoryTab';
import { TrendsTab } from '../components/TrendsTab';
import { RegressionsTab } from '../components/RegressionsTab';

export default function QADashboard() {
  const tabs = (
    <UITabs
      syncUrl="search"
      items={[
        { key: 'overview', label: 'Overview', children: <OverviewTab /> },
        { key: 'history', label: 'History', children: <HistoryTab /> },
        { key: 'trends', label: 'Trends', children: <TrendsTab /> },
        { key: 'regressions', label: 'Regressions', children: <RegressionsTab /> },
      ]}
    />
  );

  return (
    <UIPage>
      <UIPageHeader
        title="QA"
        description="Build, lint, type check, and test results with baseline tracking and regression detection"
        tabs={tabs}
      />
    </UIPage>
  );
}

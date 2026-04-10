import { HeroMetricsWidget } from '../components/HeroMetricsWidget';
import { ActivityTimelineWidget } from '../components/ActivityTimelineWidget';
import { SystemResourcesWidget } from '../components/SystemResourcesWidget';

export function DashboardPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 8 }}>
      <HeroMetricsWidget />
      <SystemResourcesWidget />
      <ActivityTimelineWidget />
    </div>
  );
}

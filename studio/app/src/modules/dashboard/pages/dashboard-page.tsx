import { UIRow, UICol } from '@kb-labs/studio-ui-kit';
import { HeroMetricsWidget } from '../components/HeroMetricsWidget';
import { ActivityTimelineWidget } from '../components/ActivityTimelineWidget';
import { SystemResourcesWidget } from '../components/SystemResourcesWidget';
import { PluginHealthWidget } from '../components/PluginHealthWidget';
import { PlatformStatusWidget } from '../components/PlatformStatusWidget';

export function DashboardPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 8 }}>
      <HeroMetricsWidget />
      <SystemResourcesWidget />
      <ActivityTimelineWidget />
      <UIRow gutter={[16, 16]}>
        <UICol xs={24} lg={14}>
          <PluginHealthWidget />
        </UICol>
        <UICol xs={24} lg={10}>
          <PlatformStatusWidget />
        </UICol>
      </UIRow>
    </div>
  );
}

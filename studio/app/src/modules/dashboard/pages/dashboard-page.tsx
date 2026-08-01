import { UIRow, UICol } from '@kb-labs/studio-ui-kit';
import { PlatformPulse } from '../components/PlatformPulse';
import { ActivityTimelineWidget } from '../components/ActivityTimelineWidget';
import { SystemResourcesWidget } from '../components/SystemResourcesWidget';
import { PluginHealthWidget } from '../components/PluginHealthWidget';
import { PlatformStatusWidget } from '../components/PlatformStatusWidget';

export function DashboardPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 8 }}>
      <PlatformPulse />

      <UIRow gutter={[16, 16]}>
        <UICol xs={24} lg={16}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SystemResourcesWidget />
            <ActivityTimelineWidget />
          </div>
        </UICol>
        <UICol xs={24} lg={8}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <PluginHealthWidget />
            <PlatformStatusWidget />
          </div>
        </UICol>
      </UIRow>
    </div>
  );
}

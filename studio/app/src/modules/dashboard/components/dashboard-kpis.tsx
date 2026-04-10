import { KBStatCard, KBStatGrid } from '@/components/ui';

export function DashboardKpis() {
  return (
    <KBStatGrid columns={4}>
      <KBStatCard label="Audit Status" value="Unavailable" />
      <KBStatCard label="Packages OK" value="-" />
      <KBStatCard label="Failed" value="-" />
      <KBStatCard label="Warnings" value="-" />
    </KBStatGrid>
  );
}


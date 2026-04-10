import { EmptyState } from '@/components/empty-state';
import { BarChart3 } from 'lucide-react';
import { UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';

export function AnalyticsPage() {
  return (
    <UIPage width="full">
      <UIPageHeader 
        title="Analytics"
        description="Event metrics and performance charts"
      />
      <EmptyState
        icon={<BarChart3 size={32} />}
        title="Coming Soon"
        description="Event metrics and performance charts will appear here."
      />
    </UIPage>
  );
}


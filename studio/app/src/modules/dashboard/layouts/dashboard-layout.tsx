import React from 'react';
import { Outlet } from 'react-router-dom';
import { UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';

export function DashboardLayout() {
  return (
    <UIPage width="full">
      <UIPageHeader
        title="Intelligence Dashboard"
        description="Real-time platform observability and performance analytics"
      />

      <Outlet />
    </UIPage>
  );
}

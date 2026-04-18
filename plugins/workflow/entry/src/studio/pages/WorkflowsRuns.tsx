/**
 * @module @kb-labs/studio-app/modules/workflows/pages/workflows-runs-page
 * All workflow runs list — Triage / Board / Table views
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UIButton,
  UISelect,
  UIRow,
  UICol,
  UIIcon,
  UITypographyText,
} from '@kb-labs/sdk/studio';
import { useData } from '@kb-labs/sdk/studio';
import type { WorkflowRun } from '@kb-labs/workflow-contracts';
import { UIPage, UIPageHeader, UICard } from '@kb-labs/sdk/studio';
import { ViewModeSelector } from '../components/shared/ViewModeSelector';
import { TriageView } from '../components/triage/TriageView';
import { BoardView } from '../components/board/BoardView';
import { TableView } from '../components/table/TableView';

type ViewMode = 'triage' | 'board' | 'table';

const VIEWS = {
  triage: { label: 'Triage' },
  board:  { label: 'Board' },
  table:  { label: 'Table' },
};

export default function WorkflowsRuns() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('triage');
  const [filters, setFilters] = useState<{ limit: number; status?: string }>({ limit: 50 });

  const { data, isLoading, refetch } = useData<{ runs: WorkflowRun[]; total: number }>('/exec/api/v1/runs', {
    params: { limit: filters.limit, ...(filters.status ? { status: filters.status } : {}) },
    pollingMs: viewMode !== 'table' ? 5000 : undefined,
  });

  const runs = data?.runs ?? [];

  return (
    <UIPage width="full">
      <UIPageHeader
        title="Workflow Runs"
        description="All workflow executions"
        breadcrumbs={[
          { title: 'Home', href: '/' },
          { title: 'Workflows', href: '/workflows' },
          { title: 'Runs' },
        ]}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ViewModeSelector views={VIEWS} current={viewMode} onChange={setViewMode} />
            <UIButton
              icon={<UIIcon name="ReloadOutlined" spin={isLoading} />}
              onClick={() => refetch()}
            />
          </div>
        }
      />

      {/* Filters */}
      <UICard style={{ marginBottom: 'var(--spacing-section)' }}>
        <UIRow gutter={16}>
          <UICol span={8}>
            <UITypographyText className="typo-label">Filter by Status</UITypographyText>
            <UISelect
              style={{ width: '100%', marginTop: 8 }}
              placeholder="All statuses"
              allowClear
              value={filters.status}
              onChange={(status) => setFilters({ ...filters, status: status as string | undefined })}
              options={[
                { label: 'Running', value: 'running' },
                { label: 'Success', value: 'success' },
                { label: 'Failed', value: 'failed' },
                { label: 'Dead Letter', value: 'dlq' },
                { label: 'Cancelled', value: 'cancelled' },
                { label: 'Queued', value: 'queued' },
              ]}
            />
          </UICol>
          <UICol span={8}>
            <UITypographyText className="typo-label">Limit</UITypographyText>
            <UISelect
              style={{ width: '100%', marginTop: 8 }}
              value={filters.limit}
              onChange={(limit) => setFilters({ ...filters, limit: limit as number })}
              options={[
                { label: '25', value: 25 },
                { label: '50', value: 50 },
                { label: '100', value: 100 },
                { label: '200', value: 200 },
              ]}
            />
          </UICol>
        </UIRow>
      </UICard>

      {/* View */}
      {viewMode === 'triage' && (
        <TriageView runs={runs} onRunClick={(id) => navigate(`/p/workflows/runs/${id}`)} />
      )}
      {viewMode === 'board' && (
        <BoardView runs={runs} onRunClick={(id) => navigate(`/p/workflows/runs/${id}`)} />
      )}
      {viewMode === 'table' && (
        <UICard>
          <TableView runs={runs} loading={isLoading} onRunClick={(id) => navigate(`/p/workflows/runs/${id}`)} />
        </UICard>
      )}
    </UIPage>
  );
}

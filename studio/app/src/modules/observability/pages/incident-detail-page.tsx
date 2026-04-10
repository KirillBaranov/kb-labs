import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UICard,
  UIAlert,
  UIBadge,
  UITag,
  UIButton,
  UISpace,
  UIDescriptions,
  UIDescriptionsItem,
  UITimeline,
  UITimelineItem,
  UIProgress,
  UIModal, UIInputTextArea,
  UIMessage,
  UISpin,
  UIDivider,
  UIRow,
  UICol,
  UIStatistic,
  UIEmptyState,
  UITable,
  UITooltip,
  UIIcon,
} from '@kb-labs/studio-ui-kit';
import type {
  IncidentDetailResponse,
  IncidentAnalysisResponse,
  IncidentSeverity,
  IncidentType,
  RootCauseItem,
} from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';

dayjs.extend(relativeTime);

/**
 * Format timestamp to human-readable string
 */
function formatTime(timestamp: number): string {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss');
}

/**
 * Get severity icon and color
 */
function getSeverityConfig(severity: IncidentSeverity): { icon: React.ReactElement; color: string } {
  switch (severity) {
    case 'critical':
      return { icon: <UIIcon name="FireOutlined" />, color: '#ff4d4f' };
    case 'warning':
      return { icon: <UIIcon name="WarningOutlined" />, color: '#faad14' };
    case 'info':
      return { icon: <UIIcon name="InfoCircleOutlined" />, color: '#1890ff' };
  }
}

/**
 * Get incident type label
 */
function getTypeLabel(type: IncidentType): string {
  switch (type) {
    case 'error_rate':
      return 'Error Rate';
    case 'latency_spike':
      return 'Latency Spike';
    case 'plugin_failure':
      return 'Plugin Failure';
    case 'adapter_failure':
      return 'Adapter Failure';
    case 'system_health':
      return 'System Health';
    case 'custom':
      return 'Custom';
  }
}

/**
 * Incident Detail Page
 *
 * Shows detailed information about an incident including AI analysis
 */
export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sources = useDataSources();
  const queryClient = useQueryClient();

  const [resolveModalVisible, setResolveModalVisible] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Fetch incident details
  const {
    data: incidentData,
    isLoading: incidentLoading,
    error: incidentError,
  } = useQuery<IncidentDetailResponse>({
    queryKey: ['incidents', 'detail', id],
    queryFn: async () => {
      if (!id) {throw new Error('Incident ID is required');}
      return sources.observability.getIncident(id);
    },
    enabled: !!id,
  });

  const incident = incidentData?.data;

  // Fetch or trigger AI analysis
  const {
    data: analysisData,
    isLoading: analysisLoading,
    error: analysisError,
    refetch: triggerAnalysis,
  } = useQuery<IncidentAnalysisResponse>({
    queryKey: ['incidents', 'analysis', id],
    queryFn: async () => {
      if (!id) {throw new Error('Incident ID is required');}
      return sources.observability.analyzeIncident(id);
    },
    enabled: false, // Manual trigger
  });

  const analysis = analysisData?.data;

  // Resolve incident mutation
  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!id) {throw new Error('Incident ID is required');}
      return sources.observability.resolveIncident(id, resolutionNotes);
    },
    onSuccess: () => {
      UIMessage.success('Incident resolved successfully');
      setResolveModalVisible(false);
      setResolutionNotes('');
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (error: Error) => {
      UIMessage.error(`Failed to resolve incident: ${error.message}`);
    },
  });

  const handleResolve = () => {
    resolveMutation.mutate();
  };

  const handleAnalyze = () => {
    triggerAnalysis();
  };

  const handleGoBack = () => {
    navigate('/observability/incidents');
  };

  if (incidentLoading) {
    return (
      <UIPage>
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <UISpin size="large" />
        </div>
      </UIPage>
    );
  }

  if (incidentError || !incident) {
    return (
      <UIPage>
        <UIAlert
          message="Failed to load incident"
          description={(incidentError as Error)?.message ?? 'Incident not found'}
          variant="error"
          showIcon
        />
      </UIPage>
    );
  }

  const severityConfig = getSeverityConfig(incident.severity);

  return (
    <UIPage>
      <UIPageHeader
        title={incident.title}
        description={`Incident ID: ${incident.id}`}
        actions={[
          <UIButton key="back" icon={<UIIcon name="ArrowLeftOutlined" />} onClick={handleGoBack} />,
          !incident.resolvedAt && (
            <UIButton
              key="resolve"
              variant="primary"
              icon={<UIIcon name="CheckCircleOutlined" />}
              onClick={() => setResolveModalVisible(true)}
            >
              Resolve
            </UIButton>
          ),
          <UIButton
            key="analyze"
            icon={<UIIcon name="ThunderboltOutlined" />}
            onClick={handleAnalyze}
            loading={analysisLoading}
            disabled={!!analysis && !analysisData?.data.cached}
          >
            {analysis ? 'Re-analyze' : 'Analyze with AI'}
          </UIButton>,
        ].filter(Boolean)}
      />

      {/* Overview */}
      <UICard title="Overview" style={{ marginBottom: 16 }}>
        <UIDescriptions column={2} bordered>
          <UIDescriptionsItem label="Severity">
            <UITag color={severityConfig.color} icon={severityConfig.icon}>
              {incident.severity.toUpperCase()}
            </UITag>
          </UIDescriptionsItem>
          <UIDescriptionsItem label="Type">
            <UITag>{getTypeLabel(incident.type)}</UITag>
          </UIDescriptionsItem>
          <UIDescriptionsItem label="Time">
            {formatTime(incident.timestamp)}
            <span style={{ marginLeft: 8, color: '#888' }}>
              ({dayjs(incident.timestamp).fromNow()})
            </span>
          </UIDescriptionsItem>
          <UIDescriptionsItem label="Status">
            {incident.resolvedAt ? (
              <UITag color="success" icon={<UIIcon name="CheckCircleOutlined" />}>
                RESOLVED
              </UITag>
            ) : (
              <UITag color="error" icon={<UIIcon name="ClockCircleOutlined" />}>
                ACTIVE
              </UITag>
            )}
          </UIDescriptionsItem>
          {incident.resolvedAt && (
            <UIDescriptionsItem label="Resolved At">
              {formatTime(incident.resolvedAt)}
              <span style={{ marginLeft: 8, color: '#888' }}>
                (Duration: {Math.floor((incident.resolvedAt - incident.timestamp) / 60000)}m)
              </span>
            </UIDescriptionsItem>
          )}
          {incident.affectedServices && incident.affectedServices.length > 0 && (
            <UIDescriptionsItem label="Affected Services" span={2}>
              <UISpace wrap>
                {incident.affectedServices.map((service) => (
                  <UITag key={service}>{service}</UITag>
                ))}
              </UISpace>
            </UIDescriptionsItem>
          )}
          <UIDescriptionsItem label="Details" span={2}>
            {incident.details}
          </UIDescriptionsItem>
          {incident.resolutionNotes && (
            <UIDescriptionsItem label="Resolution Notes" span={2}>
              {incident.resolutionNotes}
            </UIDescriptionsItem>
          )}
        </UIDescriptions>
      </UICard>

      {/* Related Data - Slow Requests (for latency incidents) */}
      {incident.type === 'latency_spike' && incident.relatedData?.metrics?.topSlowest && incident.relatedData.metrics.topSlowest.length > 0 && (
        <UICard title="Slowest Requests" style={{ marginBottom: 16 }}>
          <UITable
            dataSource={incident.relatedData.metrics.topSlowest}
            columns={[
              {
                title: 'Method',
                dataIndex: 'method',
                key: 'method',
                width: 80,
                render: (method: string) => <UITag color="blue">{method}</UITag>,
              },
              {
                title: 'Endpoint',
                dataIndex: 'endpoint',
                key: 'endpoint',
                render: (endpoint: string) => <code>{endpoint}</code>,
              },
              {
                title: 'Duration',
                dataIndex: 'durationMs',
                key: 'durationMs',
                width: 120,
                sorter: (a: any, b: any) => b.durationMs - a.durationMs,
                render: (ms: number) => (
                  <span style={{ color: ms > 1000 ? '#ff4d4f' : ms > 500 ? '#faad14' : undefined }}>
                    {ms.toLocaleString()}ms
                  </span>
                ),
              },
              {
                title: 'Status',
                dataIndex: 'statusCode',
                key: 'statusCode',
                width: 80,
                render: (code?: number) => (
                  code ? (
                    <UITag color={code >= 500 ? 'error' : code >= 400 ? 'warning' : 'success'}>
                      {code}
                    </UITag>
                  ) : '-'
                ),
              },
            ]}
            pagination={false}
            size="small"
            rowKey={(record: { endpoint: string; method: string; durationMs: number; statusCode?: number }) => record.endpoint}
          />
        </UICard>
      )}

      {/* Related Data - Metrics Comparison */}
      {incident.relatedData?.metrics && (
        <UICard title={<><UIIcon name="LineChartOutlined" /> Metrics Comparison</>} style={{ marginBottom: 16 }}>
          <UIRow gutter={16}>
            {incident.relatedData.metrics.before && (
              <UICol span={12}>
                <UICard type="inner" title="Before Incident">
                  {Object.entries(incident.relatedData.metrics.before).map(([key, value]) => (
                    <UIStatistic
                      key={key}
                      title={key}
                      value={typeof value === 'number' ? value.toFixed(2) : value}
                      style={{ marginBottom: 8 }}
                    />
                  ))}
                </UICard>
              </UICol>
            )}
            {incident.relatedData.metrics.during && (
              <UICol span={12}>
                <UICard type="inner" title="During Incident">
                  {Object.entries(incident.relatedData.metrics.during).map(([key, value]) => (
                    <UIStatistic
                      key={key}
                      title={key}
                      value={typeof value === 'number' ? value.toFixed(2) : value}
                      valueStyle={{
                        color:
                          incident.relatedData?.metrics?.before?.[key] &&
                          typeof value === 'number' &&
                          value > incident.relatedData.metrics.before[key]
                            ? '#ff4d4f'
                            : undefined,
                      }}
                      style={{ marginBottom: 8 }}
                    />
                  ))}
                </UICard>
              </UICol>
            )}
          </UIRow>
        </UICard>
      )}

      {/* Related Data - Timeline */}
      {incident.relatedData?.timeline && incident.relatedData.timeline.length > 0 && (
        <UICard title="Event Timeline" style={{ marginBottom: 16 }}>
          <UITimeline mode="left">
            {incident.relatedData.timeline.map((event, idx) => (
              <UITimelineItem
                key={idx}
                color={event.source === 'detector' ? 'red' : event.source === 'logs' ? 'orange' : 'blue'}
                label={formatTime(event.timestamp)}
              >
                <UIBadge
                  variant={event.source === 'detector' ? 'error' : 'info'}
                />{event.source.toUpperCase()}
                <div style={{ marginTop: 4 }}>{event.event}</div>
              </UITimelineItem>
            ))}
          </UITimeline>
        </UICard>
      )}

      {/* Related Data - Error Breakdown (top endpoints with errors) */}
      {incident.relatedData?.logs?.topEndpoints && incident.relatedData.logs.topEndpoints.length > 0 && (
        <UICard title="Error Breakdown by Endpoint" style={{ marginBottom: 16 }}>
          <UITable
            dataSource={incident.relatedData.logs.topEndpoints}
            columns={[
              {
                title: 'Endpoint',
                dataIndex: 'endpoint',
                key: 'endpoint',
                render: (endpoint: string) => <code>{endpoint}</code>,
              },
              {
                title: 'Error Count',
                dataIndex: 'count',
                key: 'count',
                width: 120,
                sorter: (a: any, b: any) => b.count - a.count,
                render: (count: number) => (
                  <UIBadge count={count} style={{ backgroundColor: '#ff4d4f' }} />
                ),
              },
              {
                title: 'Sample Error',
                dataIndex: 'sample',
                key: 'sample',
                ellipsis: true,
                render: (sample: string) => (
                  <UITooltip title={sample}>
                    <span style={{ color: '#666' }}>{sample}</span>
                  </UITooltip>
                ),
              },
            ]}
            pagination={false}
            size="small"
            rowKey={(record: { endpoint: string; count: number; sample: string }) => record.endpoint}
          />
        </UICard>
      )}

      {/* Related Data - Error Logs */}
      {incident.relatedData?.logs && incident.relatedData.logs.sampleErrors.length > 0 && (
        <UICard title={`Error Logs (${incident.relatedData.logs.errorCount} total)`} style={{ marginBottom: 16 }}>
          <UISpace direction="vertical" style={{ width: '100%' }}>
            {incident.relatedData.logs.sampleErrors.map((error, idx) => (
              <UIAlert
                key={idx}
                message={`Error ${idx + 1}`}
                description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{error}</pre>}
                variant="error"
                showIcon
              />
            ))}
          </UISpace>
        </UICard>
      )}

      {/* AI Analysis */}
      {analysisLoading && (
        <UICard title={<><UIIcon name="ThunderboltOutlined" /> AI Analysis</>} style={{ marginBottom: 16 }}>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <UISpin size="large" tip="Analyzing incident with AI..." />
          </div>
        </UICard>
      )}

      {analysisError && (
        <UICard title={<><UIIcon name="ThunderboltOutlined" /> AI Analysis</>} style={{ marginBottom: 16 }}>
          <UIAlert
            message="Analysis Failed"
            description={(analysisError as Error).message}
            variant="error"
            showIcon
          />
        </UICard>
      )}

      {analysis && !analysisLoading && (
        <UICard
          title={<><UIIcon name="ThunderboltOutlined" /> AI Analysis</>}
          style={{ marginBottom: 16 }}
          extra={
            analysisData?.data.cached && (
              <UIBadge variant="success">Cached</UIBadge>
            )
          }
        >
          {/* Summary */}
          <UIAlert
            message="Summary"
            description={analysis.summary}
            variant="info"
            showIcon
            icon={<UIIcon name="BulbOutlined" />}
            style={{ marginBottom: 16 }}
          />

          {/* Root Causes */}
          {analysis.rootCauses && analysis.rootCauses.length > 0 && (
            <>
              <UIDivider orientation="left">Root Causes</UIDivider>
              <UISpace direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
                {analysis.rootCauses.map((cause: RootCauseItem, idx: number) => (
                  <UICard key={idx} type="inner" size="small">
                    <UISpace direction="vertical" style={{ width: '100%' }}>
                      <div>
                        <strong>{cause.factor}</strong>
                        <UIProgress
                          percent={Math.round(cause.confidence * 100)}
                          size="small"
                          style={{ marginTop: 4 }}
                          strokeColor={
                            cause.confidence >= 0.8
                              ? '#52c41a'
                              : cause.confidence >= 0.5
                              ? '#faad14'
                              : '#ff4d4f'
                          }
                        />
                      </div>
                      <div style={{ color: '#666', fontSize: 13 }}>{cause.evidence}</div>
                    </UISpace>
                  </UICard>
                ))}
              </UISpace>
            </>
          )}

          {/* Patterns */}
          {analysis.patterns && analysis.patterns.length > 0 && (
            <>
              <UIDivider orientation="left">Detected Patterns</UIDivider>
              <ul style={{ marginBottom: 16 }}>
                {analysis.patterns.map((pattern: string, idx: number) => (
                  <li key={idx}>{pattern}</li>
                ))}
              </ul>
            </>
          )}

          {/* Recommendations */}
          {analysis.recommendations && analysis.recommendations.length > 0 && (
            <>
              <UIDivider orientation="left">Recommendations</UIDivider>
              <UISpace direction="vertical" style={{ width: '100%' }}>
                {analysis.recommendations.map((rec: string, idx: number) => (
                  <UIAlert
                    key={idx}
                    message={`Recommendation ${idx + 1}`}
                    description={rec}
                    variant="success"
                    showIcon
                  />
                ))}
              </UISpace>
            </>
          )}

          {analysis.rootCauses.length === 0 && analysis.patterns.length === 0 && analysis.recommendations.length === 0 && (
            <UIEmptyState description="No detailed analysis available" />
          )}
        </UICard>
      )}

      {/* Resolve Modal */}
      <UIModal
        title="Resolve Incident"
        open={resolveModalVisible}
        onOk={handleResolve}
        onCancel={() => setResolveModalVisible(false)}
        confirmLoading={resolveMutation.isPending}
        okText="Resolve"
      >
        <UISpace direction="vertical" style={{ width: '100%' }}>
          <p>Are you sure you want to mark this incident as resolved?</p>
          <UIInputTextArea
            rows={4}
            placeholder="Resolution notes (optional)"
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
          />
        </UISpace>
      </UIModal>
    </UIPage>
  );
}

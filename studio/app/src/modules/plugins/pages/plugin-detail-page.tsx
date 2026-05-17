import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  UISpin,
  UITag,
  UISpace,
  UITypographyText,
  UITypographyParagraph,
  UITitle,
  UICard,
  UITable,
  UIButton,
  UIAlert,
  UITabs,
  type UITabItem,
  UIEmptyState,
  UIIcon,
  UIMarkdownViewer,
} from '@kb-labs/studio-ui-kit';
import { useDataSources } from '@/providers/data-sources-provider';
import type { PluginManifestEntry } from '@kb-labs/studio-data-client';
import type { UITableColumn } from '@kb-labs/studio-ui-kit';
import { PluginAIAssistantModal } from '../components/plugin-ai-assistant-modal';
import { UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';

function PluginMarkdownContent({
  content,
  loading,
  error,
  emptyText = 'No content available',
}: {
  content: string | null;
  loading: boolean;
  error: string | null;
  emptyText?: string;
}) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <UISpin />
      </div>
    );
  }
  if (error) {
    return <UIAlert variant="error" message="Failed to load content" description={error} showIcon />;
  }
  if (content === null) {
    return <UIEmptyState description={emptyText} />;
  }
  return <UICard><UIMarkdownViewer content={content} /></UICard>;
}

export function PluginDetailPage() {
  const { pluginId: encodedPluginId } = useParams<{ pluginId: string }>();
  const navigate = useNavigate();
  const { plugins: pluginsSource } = useDataSources();
  const [loading, setLoading] = useState(true);
  const [plugin, setPlugin] = useState<PluginManifestEntry | null>(null);
  const [apiBasePath, setApiBasePath] = useState<string>('');
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // README state
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [readmeError, setReadmeError] = useState<string | null>(null);
  const [readmeLoaded, setReadmeLoaded] = useState(false);

  // Changelog state
  const [changelogContent, setChangelogContent] = useState<string | null>(null);
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [changelogError, setChangelogError] = useState<string | null>(null);
  const [changelogLoaded, setChangelogLoaded] = useState(false);
  const [hasChangelog, setHasChangelog] = useState<boolean | null>(null);

  const pluginId = encodedPluginId ? decodeURIComponent(encodedPluginId) : '';

  const loadPlugin = useCallback(async () => {
    try {
      setLoading(true);
      const result = await pluginsSource.getPlugins();
      const found = result.manifests.find((p) => p.pluginId === pluginId);
      setPlugin(found || null);
      setApiBasePath(result.apiBasePath || '');
    } catch (err) {
      console.error('Failed to load plugin:', err);
    } finally {
      setLoading(false);
    }
  }, [pluginId, pluginsSource]);

  useEffect(() => {
    loadPlugin();
  }, [loadPlugin]);

  // Probe for changelog on mount — determines whether to show the tab
  useEffect(() => {
    if (!plugin || changelogLoaded || changelogLoading) return;
    setChangelogLoading(true);
    pluginsSource.getPluginChangelog(plugin.pluginId)
      .then((content) => {
        setChangelogContent(content);
        setHasChangelog(content !== null);
      })
      .catch((err) => {
        console.error('Failed to load changelog:', err);
        setChangelogError(err instanceof Error ? err.message : 'Failed to load Changelog');
        setHasChangelog(false);
      })
      .finally(() => {
        setChangelogLoaded(true);
        setChangelogLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin?.pluginId]);

  // Load README lazily when the tab is first opened
  useEffect(() => {
    if (activeTab !== 'readme' || !plugin || readmeLoaded || readmeLoading) return;
    setReadmeLoading(true);
    pluginsSource.getPluginReadme(plugin.pluginId)
      .then((content) => {
        setReadmeContent(content);
      })
      .catch((err) => {
        setReadmeError(err instanceof Error ? err.message : 'Failed to load README');
      })
      .finally(() => {
        setReadmeLoaded(true);
        setReadmeLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, plugin?.pluginId]);

  if (loading) {
    return (
      <UIPage>
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <UISpin size="large" />
        </div>
      </UIPage>
    );
  }

  if (!plugin) {
    return (
      <UIPage>
        <UIPageHeader title="Plugin Not Found" />
        <UIEmptyState description="Plugin not found in registry" />
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <UIButton variant="primary" onClick={() => navigate('/marketplace')}>
            Back to Plugins
          </UIButton>
        </div>
      </UIPage>
    );
  }

  const { manifest } = plugin;
  const display = manifest.display;

  const cliCommands = manifest.cli?.commands || [];
  const restRoutes = manifest.rest?.routes || [];
  const workflowHandlers = manifest.workflows?.handlers || [];
  const jobs = manifest.jobs?.handlers || [];
  const permissions = manifest.permissions;
  const platformReqs = manifest.platform;

  const tabItems: UITabItem[] = [
    {
      key: 'overview',
      label: 'Overview',
      children: (
        <UISpace direction="vertical" size="large" style={{ width: '100%' }}>
          {/* Validation errors banner */}
          {plugin.validation && !plugin.validation.valid && (
            <UIAlert
              variant="error"
              icon={<UIIcon name="CloseCircleOutlined" />}
              message={`Manifest Validation Failed (${plugin.validation.errors.length} error${plugin.validation.errors.length > 1 ? 's' : ''})`}
              description={
                <div style={{ marginTop: 8 }}>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {plugin.validation.errors.map((error, idx) => (
                      <li key={idx} style={{ marginBottom: 4 }}>
                        <UITypographyText code style={{ fontSize: 12 }}>{error}</UITypographyText>
                      </li>
                    ))}
                  </ul>
                </div>
              }
              showIcon
            />
          )}

          {/* Hero card */}
          <UICard>
            <UISpace align="start" size="large">
              {display?.icon && (
                <div style={{ fontSize: 56, lineHeight: 1, flexShrink: 0 }}>{display.icon}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <UISpace align="center" wrap style={{ marginBottom: 8 }}>
                  <UITitle level={2} style={{ margin: 0 }}>
                    {display?.name || manifest.id}
                  </UITitle>
                  <UITag color="blue" style={{ fontSize: 13 }}>
                    v{manifest.version}
                  </UITag>
                  <UITag color="default">
                    {typeof plugin.source === 'string'
                      ? plugin.source
                      : plugin.source?.kind || 'unknown'}
                  </UITag>
                  <UITag>{manifest.schema}</UITag>
                </UISpace>

                {display?.description && (
                  <UITypographyParagraph style={{ fontSize: 15, marginBottom: 12, opacity: 0.75 }}>
                    {display.description}
                  </UITypographyParagraph>
                )}

                {display?.tags && display.tags.length > 0 && (
                  <UISpace wrap style={{ marginBottom: 12 }}>
                    {display.tags.map((tag, idx) => (
                      <UITag key={typeof tag === 'string' ? tag : `tag-${idx}`} color="default">
                        {typeof tag === 'string' ? tag : JSON.stringify(tag)}
                      </UITag>
                    ))}
                  </UISpace>
                )}

                {(display?.homepage || display?.repository) && (
                  <UISpace size="large">
                    {display?.homepage && (
                      <a href={display.homepage} target="_blank" rel="noopener noreferrer">
                        <UISpace size="small">
                          <UIIcon name="GlobalOutlined" />
                          Homepage
                        </UISpace>
                      </a>
                    )}
                    {display?.repository && (
                      <a href={display.repository} target="_blank" rel="noopener noreferrer">
                        <UISpace size="small">
                          <UIIcon name="LinkOutlined" />
                          Repository
                        </UISpace>
                      </a>
                    )}
                  </UISpace>
                )}
              </div>
            </UISpace>
          </UICard>

          {/* Metadata + Capabilities — two-column */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(260px, 320px) 1fr',
              gap: 24,
              alignItems: 'start',
            }}
          >
            {/* Metadata card */}
            <UICard title="Details">
              <UISpace direction="vertical" size="middle" style={{ width: '100%' }}>
                {display?.author && (
                  <div>
                    <UITypographyText type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      Author
                    </UITypographyText>
                    <UISpace size="small">
                      <UIIcon name="UserOutlined" />
                      <UITypographyText>{display.author}</UITypographyText>
                    </UISpace>
                  </div>
                )}

                <div>
                  <UITypographyText type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                    Plugin ID
                  </UITypographyText>
                  <UITypographyText code copyable style={{ fontSize: 12 }}>
                    {manifest.id}
                  </UITypographyText>
                </div>

                {plugin.discoveredAt && (
                  <div>
                    <UITypographyText type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      Discovered
                    </UITypographyText>
                    <UISpace size="small">
                      <UIIcon name="SearchOutlined" />
                      <UITypographyText style={{ fontSize: 13 }}>
                        {new Date(plugin.discoveredAt).toLocaleString()}
                      </UITypographyText>
                    </UISpace>
                  </div>
                )}

                {plugin.buildTimestamp && (
                  <div>
                    <UITypographyText type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      Last Built
                    </UITypographyText>
                    <UISpace size="small">
                      <UIIcon name="ClockCircleOutlined" />
                      <UITypographyText style={{ fontSize: 13 }}>
                        {new Date(plugin.buildTimestamp).toLocaleString()}
                      </UITypographyText>
                    </UISpace>
                  </div>
                )}
              </UISpace>
            </UICard>

            {/* Capabilities card */}
            <UICard title="Capabilities">
              <UISpace direction="vertical" size="middle" style={{ width: '100%' }}>
                {(cliCommands.length > 0 || restRoutes.length > 0 || workflowHandlers.length > 0 || jobs.length > 0) ? (
                  <UISpace wrap size="middle">
                    {cliCommands.length > 0 && (
                      <UITag icon={<UIIcon name="CodeOutlined" />} color="blue" style={{ fontSize: 13, padding: '4px 12px' }}>
                        {cliCommands.length} CLI Command{cliCommands.length > 1 ? 's' : ''}
                      </UITag>
                    )}
                    {restRoutes.length > 0 && (
                      <UITag icon={<UIIcon name="ApiOutlined" />} color="green" style={{ fontSize: 13, padding: '4px 12px' }}>
                        {restRoutes.length} REST Route{restRoutes.length > 1 ? 's' : ''}
                      </UITag>
                    )}
                    {workflowHandlers.length > 0 && (
                      <UITag icon={<UIIcon name="NodeIndexOutlined" />} color="purple" style={{ fontSize: 13, padding: '4px 12px' }}>
                        {workflowHandlers.length} Workflow{workflowHandlers.length > 1 ? 's' : ''}
                      </UITag>
                    )}
                    {jobs.length > 0 && (
                      <UITag icon={<UIIcon name="ClockCircleOutlined" />} color="orange" style={{ fontSize: 13, padding: '4px 12px' }}>
                        {jobs.length} Scheduled Job{jobs.length > 1 ? 's' : ''}
                      </UITag>
                    )}
                  </UISpace>
                ) : (
                  <UIEmptyState description="No capabilities declared" />
                )}

                {permissions && (
                  <UIAlert
                    icon={<UIIcon name="LockOutlined" />}
                    variant="warning"
                    message="Requires permissions"
                    description="See Permissions tab for details"
                    showIcon
                  />
                )}
                {platformReqs?.requires && platformReqs.requires.length > 0 && (
                  <UIAlert
                    icon={<UIIcon name="DatabaseOutlined" />}
                    variant="info"
                    message="Platform Requirements"
                    description={
                      <UISpace wrap>
                        {platformReqs.requires.map((req) => (
                          <UITag key={req} color="cyan">
                            {req}
                          </UITag>
                        ))}
                      </UISpace>
                    }
                    showIcon
                  />
                )}
              </UISpace>
            </UICard>
          </div>
        </UISpace>
      ),
    },
    {
      key: 'readme',
      label: 'README',
      icon: <UIIcon name="FileTextOutlined" />,
      children: (
        <PluginMarkdownContent
          content={readmeContent}
          loading={readmeLoading}
          error={readmeError}
          emptyText="This plugin has no README.md"
        />
      ),
    },
    ...(cliCommands.length > 0 ? [{
      key: 'cli',
      label: `CLI Commands (${cliCommands.length})`,
      icon: <UIIcon name="CodeOutlined" />,
      children: <CLICommandsTable commands={cliCommands} />,
    }] : []),
    ...(restRoutes.length > 0 ? [{
      key: 'rest',
      label: `REST API (${restRoutes.length})`,
      icon: <UIIcon name="ApiOutlined" />,
      children: <RestRoutesTable routes={restRoutes} basePath={manifest.rest?.basePath} apiBasePath={apiBasePath} />,
    }] : []),
    ...(workflowHandlers.length > 0 ? [{
      key: 'workflows',
      label: `Workflows (${workflowHandlers.length})`,
      icon: <UIIcon name="NodeIndexOutlined" />,
      children: <WorkflowsTable handlers={workflowHandlers} />,
    }] : []),
    ...(jobs.length > 0 ? [{
      key: 'jobs',
      label: `Jobs (${jobs.length})`,
      icon: <UIIcon name="ClockCircleOutlined" />,
      children: <JobsTable jobs={jobs} />,
    }] : []),
    ...(permissions ? [{
      key: 'permissions',
      label: 'Permissions',
      icon: <UIIcon name="LockOutlined" />,
      children: <PermissionsView permissions={permissions} />,
    }] : []),
    ...(hasChangelog ? [{
      key: 'changelog',
      label: 'Changelog',
      icon: <UIIcon name="HistoryOutlined" />,
      children: (
        <PluginMarkdownContent
          content={changelogContent}
          loading={changelogLoading}
          error={changelogError}
          emptyText="This plugin has no CHANGELOG.md"
        />
      ),
    }] : []),
    {
      key: 'manifest',
      label: 'Raw Manifest (JSON)',
      children: (
        <UICard>
          <div style={{ marginBottom: 12 }}>
            <UITypographyText type="secondary" style={{ fontSize: 12 }}>Plugin root: </UITypographyText>
            <UITypographyText code copyable style={{ fontSize: 12 }}>{plugin.pluginRoot}</UITypographyText>
          </div>
          <pre style={{ overflow: 'auto', maxHeight: 600, margin: 0 }}>
            {JSON.stringify(manifest, null, 2)}
          </pre>
        </UICard>
      ),
    },
  ];

  const handleAskAI = async (question: string) => {
    if (!pluginId) {
      throw new Error('Plugin ID is required');
    }
    return pluginsSource.askAboutPlugin(pluginId, { question });
  };

  return (
    <UIPage>
      <UISpace style={{ marginBottom: 24, width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
        <UIButton
          icon={<UIIcon name="ArrowLeftOutlined" />}
          onClick={() => navigate('/marketplace')}
          variant="text"
        >
          Back to Plugins
        </UIButton>
        <UIButton
          icon={<UIIcon name="QuestionCircleOutlined" />}
          onClick={() => setAiModalOpen(true)}
          variant="primary"
        >
          AI Assistant
        </UIButton>
      </UISpace>

      <UITabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />

      <PluginAIAssistantModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        pluginId={pluginId}
        pluginName={display?.name || manifest.id}
        onAsk={handleAskAI}
      />
    </UIPage>
  );
}

// Sub-components for different sections

function CLICommandsTable({ commands }: { commands: any[] }) {
  const columns: UITableColumn<any>[] = [
    {
      title: 'Command',
      dataIndex: 'path',
      key: 'path',
      render: (path: string) => (
        <UITypographyText code strong>{path}</UITypographyText>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'describe',
      key: 'describe',
      render: (desc) => (typeof desc === 'string' ? desc : desc ? JSON.stringify(desc) : '--'),
    },
    {
      title: 'Flags',
      dataIndex: 'flags',
      key: 'flags',
      render: (flags) =>
        flags?.length > 0 ? (
          <UISpace wrap>
            {flags.map((flag: any) => (
              <UITag key={flag.name}>
                --{flag.name}
                {flag.required && <UITypographyText type="danger">*</UITypographyText>}
              </UITag>
            ))}
          </UISpace>
        ) : (
          <UITypographyText type="secondary">None</UITypographyText>
        ),
    },
    {
      title: 'Handler',
      dataIndex: 'handler',
      key: 'handler',
      render: (handler) => (
        <UITypographyText code style={{ fontSize: 11 }}>
          {handler}
        </UITypographyText>
      ),
    },
  ];

  return (
    <UICard>
      <UITable
        columns={columns}
        dataSource={commands}
        rowKey="path"
        pagination={false}
        expandable={{
          expandedRowRender: (record) =>
            record.flags && record.flags.length > 0 ? (
              <div style={{ margin: 0, paddingLeft: 48 }}>
                <UITitle level={5}>Flags</UITitle>
                {record.flags.map((flag: any) => (
                  <div key={flag.name} style={{ marginBottom: 8 }}>
                    <UITypographyText code>--{flag.name}</UITypographyText>
                    {flag.alias && <UITypographyText type="secondary"> (-{flag.alias})</UITypographyText>}
                    {flag.required && <UITag color="red">Required</UITag>}
                    <UITag>{flag.type}</UITag>
                    {flag.default !== undefined && (
                      <UITag color="blue">
                        Default: {typeof flag.default === 'object' ? JSON.stringify(flag.default) : String(flag.default)}
                      </UITag>
                    )}
                    {flag.choices && flag.choices.length > 0 && (
                      <UITag color="cyan">
                        Choices: {flag.choices.join(', ')}
                      </UITag>
                    )}
                    <div>
                      <UITypographyText type="secondary">{flag.description || '--'}</UITypographyText>
                    </div>
                  </div>
                ))}
              </div>
            ) : null,
        }}
      />
    </UICard>
  );
}

function RestRoutesTable({ routes, basePath, apiBasePath }: { routes: any[]; basePath?: string; apiBasePath?: string }) {
  // Combine API base path with plugin base path, avoiding duplicate /v1
  const fullBasePath = apiBasePath && basePath
    ? basePath.startsWith('/v1')
      ? apiBasePath + basePath.slice(3) // Remove /v1 from plugin basePath if API already has /api/v1
      : apiBasePath + basePath
    : basePath || '';
  const columns: UITableColumn<any>[] = [
    {
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      width: 100,
      render: (method) => {
        const colors: Record<string, string> = {
          GET: 'green',
          POST: 'blue',
          PUT: 'orange',
          PATCH: 'purple',
          DELETE: 'red',
        };
        return <UITag color={colors[method] || 'default'}>{method}</UITag>;
      },
    },
    {
      title: 'Path',
      dataIndex: 'path',
      key: 'path',
      render: (path) => (
        <UITypographyText code>
          {fullBasePath}{path}
        </UITypographyText>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (desc) => (typeof desc === 'string' ? desc : desc ? JSON.stringify(desc) : '--'),
    },
    {
      title: 'Timeout',
      dataIndex: 'timeoutMs',
      key: 'timeoutMs',
      render: (timeout) => (timeout ? `${timeout}ms` : '--'),
    },
    {
      title: 'Handler',
      dataIndex: 'handler',
      key: 'handler',
      render: (handler) => (
        <UITypographyText code style={{ fontSize: 11 }}>
          {handler}
        </UITypographyText>
      ),
    },
  ];

  const formatSchemaRef = (schema: any): string => {
    if (!schema) {return '--';}
    if (typeof schema === 'string') {return schema;}
    if ('$ref' in schema) {return schema.$ref;}
    if ('zod' in schema) {return schema.zod;}
    return JSON.stringify(schema);
  };

  return (
    <UICard>
      {fullBasePath && (
        <UIAlert
          message={
            <span>
              Base Path: <UITypographyText code>{fullBasePath}</UITypographyText>
            </span>
          }
          variant="info"
          style={{ marginBottom: 16 }}
        />
      )}
      <UITable
        columns={columns}
        dataSource={routes}
        rowKey={(record) => `${record.method} ${record.path}`}
        pagination={false}
        expandable={{
          expandedRowRender: (record) => {
            const hasInput = record.input;
            const hasOutput = record.output;
            const hasErrors = record.errors && record.errors.length > 0;

            if (!hasInput && !hasOutput && !hasErrors) {return null;}

            return (
              <div style={{ margin: 0, paddingLeft: 48 }}>
                {hasInput && (
                  <div style={{ marginBottom: 16 }}>
                    <UITitle level={5}>
                      {record.method === 'GET' ? 'Query Parameters' : 'Request Body'}
                    </UITitle>
                    <UITypographyText code>{formatSchemaRef(record.input)}</UITypographyText>
                  </div>
                )}
                {hasOutput && (
                  <div style={{ marginBottom: 16 }}>
                    <UITitle level={5}>Response</UITitle>
                    <UITypographyText code>{formatSchemaRef(record.output)}</UITypographyText>
                  </div>
                )}
                {hasErrors && (
                  <div>
                    <UITitle level={5}>Error Responses</UITitle>
                    {record.errors.map((error: any, idx: number) => (
                      <div key={idx} style={{ marginBottom: 8 }}>
                        <UITag color="red">{error.code}</UITag>
                        <UITypographyText>{error.message || '--'}</UITypographyText>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          },
          rowExpandable: (record) => !!(record.input || record.output || (record.errors && record.errors.length > 0)),
        }}
      />
    </UICard>
  );
}

function WorkflowsTable({ handlers }: { handlers: any[] }) {
  const columns: UITableColumn<any>[] = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      render: (id) => <UITypographyText code>{id}</UITypographyText>,
    },
    {
      title: 'Description',
      dataIndex: 'describe',
      key: 'describe',
      render: (desc) => (typeof desc === 'string' ? desc : desc ? JSON.stringify(desc) : '--'),
    },
    {
      title: 'Handler',
      dataIndex: 'handler',
      key: 'handler',
      render: (handler) => (
        <UITypographyText code style={{ fontSize: 11 }}>
          {handler}
        </UITypographyText>
      ),
    },
  ];

  return (
    <UICard>
      <UITable columns={columns} dataSource={handlers} rowKey="id" pagination={false} />
    </UICard>
  );
}

function JobsTable({ jobs }: { jobs: any[] }) {
  const columns: UITableColumn<any>[] = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      render: (id) => <UITypographyText code>{id}</UITypographyText>,
    },
    {
      title: 'Description',
      dataIndex: 'describe',
      key: 'describe',
      render: (desc) => (typeof desc === 'string' ? desc : desc ? JSON.stringify(desc) : '--'),
    },
    {
      title: 'Schedule',
      dataIndex: 'schedule',
      key: 'schedule',
      render: (schedule) => (schedule ? <UITag color="orange">{schedule}</UITag> : <UITypographyText type="secondary">Manual</UITypographyText>),
    },
    {
      title: 'Enabled',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled) =>
        enabled !== false ? <UITag color="green">Yes</UITag> : <UITag color="red">No</UITag>,
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      render: (priority) => priority || 5,
    },
    {
      title: 'Handler',
      dataIndex: 'handler',
      key: 'handler',
      render: (handler) => (
        <UITypographyText code style={{ fontSize: 11 }}>
          {handler}
        </UITypographyText>
      ),
    },
  ];

  return (
    <UICard>
      <UITable columns={columns} dataSource={jobs} rowKey="id" pagination={false} />
    </UICard>
  );
}

function PermissionsView({ permissions }: { permissions: any }) {
  if (!permissions) {
    return (
      <UICard>
        <UIEmptyState description="No permissions specified for this plugin" />
      </UICard>
    );
  }

  return (
    <UISpace direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Filesystem Permissions */}
      {permissions.fs && (
        <UICard
          title={
            <UISpace>
              <UIIcon name="LockOutlined" />
              <span>Filesystem Permissions</span>
            </UISpace>
          }
        >
          <UITypographyParagraph type="secondary" style={{ marginBottom: 16 }}>
            File and directory access patterns that this plugin is allowed to use. Read access allows viewing files, write access allows creating or modifying files.
          </UITypographyParagraph>
          <UISpace direction="vertical" size="middle" style={{ width: '100%' }}>
            {permissions.fs.read && permissions.fs.read.length > 0 && (
              <div>
                <UITypographyText strong>Read Access:</UITypographyText>
                <div style={{ marginTop: 8 }}>
                  {permissions.fs.read.map((path: string, idx: number) => (
                    <div key={idx} style={{ marginBottom: 4 }}>
                      <UITypographyText code style={{ fontSize: 12 }}>
                        {path}
                      </UITypographyText>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {permissions.fs.write && permissions.fs.write.length > 0 && (
              <div>
                <UITypographyText strong>Write Access:</UITypographyText>
                <div style={{ marginTop: 8 }}>
                  {permissions.fs.write.map((path: string, idx: number) => (
                    <div key={idx} style={{ marginBottom: 4 }}>
                      <UITypographyText code style={{ fontSize: 12 }}>
                        {path}
                      </UITypographyText>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </UISpace>
        </UICard>
      )}

      {/* Network Permissions */}
      {permissions.network?.fetch && permissions.network.fetch.length > 0 && (
        <UICard
          title={
            <UISpace>
              <UIIcon name="GlobalOutlined" />
              <span>Network Permissions</span>
            </UISpace>
          }
        >
          <UITypographyParagraph type="secondary" style={{ marginBottom: 16 }}>
            External hosts and APIs that this plugin can communicate with over the network.
          </UITypographyParagraph>
          <div>
            <UITypographyText strong>Allowed Hosts:</UITypographyText>
            <div style={{ marginTop: 8 }}>
              {permissions.network.fetch.map((host: string, idx: number) => (
                <div key={idx} style={{ marginBottom: 4 }}>
                  <UITypographyText code style={{ fontSize: 12 }}>
                    {host}
                  </UITypographyText>
                </div>
              ))}
            </div>
          </div>
        </UICard>
      )}

      {/* Environment Variables */}
      {permissions.env?.read && permissions.env.read.length > 0 && (
        <UICard title="Environment Variables">
          <UITypographyParagraph type="secondary" style={{ marginBottom: 16 }}>
            System environment variables that this plugin can access. Used for configuration and secrets management.
          </UITypographyParagraph>
          <div>
            <UITypographyText strong>Read Access:</UITypographyText>
            <div style={{ marginTop: 8 }}>
              <UISpace wrap>
                {permissions.env.read.map((env: string, idx: number) => (
                  <UITag key={idx} color="cyan">
                    {env}
                  </UITag>
                ))}
              </UISpace>
            </div>
          </div>
        </UICard>
      )}

      {/* Shell Permissions */}
      {permissions.shell && (
        <UICard
          title={
            <UISpace>
              <UIIcon name="ConsoleSqlOutlined" />
              <span>Shell Permissions</span>
            </UISpace>
          }
        >
          <UITypographyParagraph type="secondary" style={{ marginBottom: 16 }}>
            Shell commands that this plugin is allowed to execute. Shell access is restricted by default for security.
          </UITypographyParagraph>
          {permissions.shell.allow && permissions.shell.allow.length > 0 ? (
            <div>
              <UITypographyText strong>Allowed Commands:</UITypographyText>
              <div style={{ marginTop: 8 }}>
                <UISpace direction="vertical" style={{ width: '100%' }}>
                  {permissions.shell.allow.map((cmd: string, idx: number) => (
                    <div key={idx} style={{ marginBottom: 4 }}>
                      <UITypographyText code style={{ fontSize: 12 }}>
                        {cmd}
                      </UITypographyText>
                    </div>
                  ))}
                </UISpace>
              </div>
            </div>
          ) : (
            <UIAlert
              variant="warning"
              message="Shell access disabled"
              description="This plugin has no shell execution permissions."
              showIcon
            />
          )}
        </UICard>
      )}

      {/* Platform Services */}
      {permissions.platform && (
        <UICard
          title={
            <UISpace>
              <UIIcon name="DatabaseOutlined" />
              <span>Platform Services</span>
            </UISpace>
          }
        >
          <UITypographyParagraph type="secondary" style={{ marginBottom: 16 }}>
            Access to KB Labs platform services like LLM, vector store, cache, and analytics.
          </UITypographyParagraph>
          <UISpace direction="vertical" size="middle" style={{ width: '100%' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 12,
              }}
            >
              {/* LLM Service */}
              {permissions.platform.llm !== undefined && (
                <UICard size="small">
                  <UISpace direction="vertical" size="small">
                    <UISpace>
                      {permissions.platform.llm ? (
                        <UIIcon name="CheckCircleOutlined" style={{ color: '#52c41a' }} />
                      ) : (
                        <UIIcon name="WarningOutlined" style={{ color: '#d9d9d9' }} />
                      )}
                      <UITypographyText strong>LLM Service</UITypographyText>
                    </UISpace>
                    {typeof permissions.platform.llm === 'object' && permissions.platform.llm.models && (
                      <div>
                        <UITypographyText type="secondary" style={{ fontSize: 12 }}>Models:</UITypographyText>
                        <div style={{ marginTop: 4 }}>
                          <UISpace wrap size="small">
                            {permissions.platform.llm.models.map((model: string, idx: number) => (
                              <UITag key={idx} color="blue" style={{ fontSize: 11 }}>
                                {model}
                              </UITag>
                            ))}
                          </UISpace>
                        </div>
                      </div>
                    )}
                  </UISpace>
                </UICard>
              )}

              {/* Vector Store */}
              {permissions.platform.vectorStore !== undefined && (
                <UICard size="small">
                  <UISpace direction="vertical" size="small">
                    <UISpace>
                      {permissions.platform.vectorStore ? (
                        <UIIcon name="CheckCircleOutlined" style={{ color: '#52c41a' }} />
                      ) : (
                        <UIIcon name="WarningOutlined" style={{ color: '#d9d9d9' }} />
                      )}
                      <UITypographyText strong>Vector Store</UITypographyText>
                    </UISpace>
                    {typeof permissions.platform.vectorStore === 'object' && permissions.platform.vectorStore.collections && (
                      <div>
                        <UITypographyText type="secondary" style={{ fontSize: 12 }}>Collections:</UITypographyText>
                        <div style={{ marginTop: 4 }}>
                          <UISpace wrap size="small">
                            {permissions.platform.vectorStore.collections.map((col: string, idx: number) => (
                              <UITag key={idx} color="purple" style={{ fontSize: 11 }}>
                                {col}
                              </UITag>
                            ))}
                          </UISpace>
                        </div>
                      </div>
                    )}
                  </UISpace>
                </UICard>
              )}

              {/* Cache */}
              {permissions.platform.cache !== undefined && (
                <UICard size="small">
                  <UISpace direction="vertical" size="small">
                    <UISpace>
                      {permissions.platform.cache ? (
                        <UIIcon name="CheckCircleOutlined" style={{ color: '#52c41a' }} />
                      ) : (
                        <UIIcon name="WarningOutlined" style={{ color: '#d9d9d9' }} />
                      )}
                      <UITypographyText strong>Cache</UITypographyText>
                    </UISpace>
                    {typeof permissions.platform.cache === 'object' && permissions.platform.cache.namespaces && (
                      <div>
                        <UITypographyText type="secondary" style={{ fontSize: 12 }}>Namespaces:</UITypographyText>
                        <div style={{ marginTop: 4 }}>
                          <UISpace wrap size="small">
                            {permissions.platform.cache.namespaces.map((ns: string, idx: number) => (
                              <UITag key={idx} color="cyan" style={{ fontSize: 11 }}>
                                {ns}
                              </UITag>
                            ))}
                          </UISpace>
                        </div>
                      </div>
                    )}
                  </UISpace>
                </UICard>
              )}

              {/* Storage */}
              {permissions.platform.storage !== undefined && (
                <UICard size="small">
                  <UISpace direction="vertical" size="small">
                    <UISpace>
                      {permissions.platform.storage ? (
                        <UIIcon name="CheckCircleOutlined" style={{ color: '#52c41a' }} />
                      ) : (
                        <UIIcon name="WarningOutlined" style={{ color: '#d9d9d9' }} />
                      )}
                      <UITypographyText strong>Storage</UITypographyText>
                    </UISpace>
                    {typeof permissions.platform.storage === 'object' && permissions.platform.storage.paths && (
                      <div>
                        <UITypographyText type="secondary" style={{ fontSize: 12 }}>Paths:</UITypographyText>
                        <div style={{ marginTop: 4 }}>
                          <UISpace wrap size="small">
                            {permissions.platform.storage.paths.map((path: string, idx: number) => (
                              <UITag key={idx} color="orange" style={{ fontSize: 11 }}>
                                {path}
                              </UITag>
                            ))}
                          </UISpace>
                        </div>
                      </div>
                    )}
                  </UISpace>
                </UICard>
              )}

              {/* Analytics */}
              {permissions.platform.analytics !== undefined && (
                <UICard size="small">
                  <UISpace>
                    {permissions.platform.analytics ? (
                      <UIIcon name="CheckCircleOutlined" style={{ color: '#52c41a' }} />
                    ) : (
                      <UIIcon name="WarningOutlined" style={{ color: '#d9d9d9' }} />
                    )}
                    <UITypographyText strong>Analytics</UITypographyText>
                  </UISpace>
                </UICard>
              )}

              {/* Embeddings */}
              {permissions.platform.embeddings !== undefined && (
                <UICard size="small">
                  <UISpace>
                    {permissions.platform.embeddings ? (
                      <UIIcon name="CheckCircleOutlined" style={{ color: '#52c41a' }} />
                    ) : (
                      <UIIcon name="WarningOutlined" style={{ color: '#d9d9d9' }} />
                    )}
                    <UITypographyText strong>Embeddings</UITypographyText>
                  </UISpace>
                </UICard>
              )}

              {/* Events */}
              {permissions.platform.events !== undefined && (
                <UICard size="small">
                  <UISpace direction="vertical" size="small">
                    <UISpace>
                      {permissions.platform.events ? (
                        <UIIcon name="CheckCircleOutlined" style={{ color: '#52c41a' }} />
                      ) : (
                        <UIIcon name="WarningOutlined" style={{ color: '#d9d9d9' }} />
                      )}
                      <UITypographyText strong>Event Bus</UITypographyText>
                    </UISpace>
                    {typeof permissions.platform.events === 'object' && (
                      <div>
                        {permissions.platform.events.publish && permissions.platform.events.publish.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <UITypographyText type="secondary" style={{ fontSize: 12 }}>Publish:</UITypographyText>
                            <div style={{ marginTop: 4 }}>
                              <UISpace wrap size="small">
                                {permissions.platform.events.publish.map((evt: string, idx: number) => (
                                  <UITag key={idx} color="green" style={{ fontSize: 11 }}>
                                    {evt}
                                  </UITag>
                                ))}
                              </UISpace>
                            </div>
                          </div>
                        )}
                        {permissions.platform.events.subscribe && permissions.platform.events.subscribe.length > 0 && (
                          <div>
                            <UITypographyText type="secondary" style={{ fontSize: 12 }}>Subscribe:</UITypographyText>
                            <div style={{ marginTop: 4 }}>
                              <UISpace wrap size="small">
                                {permissions.platform.events.subscribe.map((evt: string, idx: number) => (
                                  <UITag key={idx} color="blue" style={{ fontSize: 11 }}>
                                    {evt}
                                  </UITag>
                                ))}
                              </UISpace>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </UISpace>
                </UICard>
              )}
            </div>
          </UISpace>
        </UICard>
      )}

      {/* Quotas */}
      {permissions.quotas && (
        <UICard title="Resource Quotas">
          <UITypographyParagraph type="secondary" style={{ marginBottom: 16 }}>
            Maximum resource limits for this plugin to prevent runaway processes and ensure system stability.
          </UITypographyParagraph>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
            }}
          >
            {permissions.quotas.timeoutMs && (
              <UICard size="small">
                <div style={{ textAlign: 'center' }}>
                  <UITypographyText type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                    Timeout
                  </UITypographyText>
                  <UITypographyText strong style={{ fontSize: 20 }}>
                    {permissions.quotas.timeoutMs}
                  </UITypographyText>
                  <UITypographyText type="secondary" style={{ fontSize: 12 }}>
                    ms
                  </UITypographyText>
                </div>
              </UICard>
            )}
            {permissions.quotas.memoryMb && (
              <UICard size="small">
                <div style={{ textAlign: 'center' }}>
                  <UITypographyText type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                    Memory
                  </UITypographyText>
                  <UITypographyText strong style={{ fontSize: 20 }}>
                    {permissions.quotas.memoryMb}
                  </UITypographyText>
                  <UITypographyText type="secondary" style={{ fontSize: 12 }}>
                    MB
                  </UITypographyText>
                </div>
              </UICard>
            )}
            {permissions.quotas.cpuMs && (
              <UICard size="small">
                <div style={{ textAlign: 'center' }}>
                  <UITypographyText type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                    CPU Time
                  </UITypographyText>
                  <UITypographyText strong style={{ fontSize: 20 }}>
                    {permissions.quotas.cpuMs}
                  </UITypographyText>
                  <UITypographyText type="secondary" style={{ fontSize: 12 }}>
                    ms
                  </UITypographyText>
                </div>
              </UICard>
            )}
          </div>
        </UICard>
      )}
    </UISpace>
  );
}

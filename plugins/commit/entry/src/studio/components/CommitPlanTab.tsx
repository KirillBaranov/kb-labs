/**
 * CommitPlanTab — commit plan viewer with generate/apply/push/reset actions.
 */

import { useState } from 'react';
import { theme } from 'antd';
import {
  useData, useMutateData, useNotification,
  UICard, UIButton, UIEmptyState, UISpin, UIAlert, UIBadge, UITag,
  UITooltip, UIIcon, UISpace, UICheckbox, UIInput, UIDropdown,
  UIPopconfirm, UITypographyText, UIModalConfirm, UIModalError, UIFlex,
} from '@kb-labs/sdk/studio';

const { useToken } = theme;
const Text = UITypographyText;

interface CommitPlanTabProps {
  scope: string;
}

interface Commit {
  id: string;
  type: string;
  scope?: string;
  message: string;
  body?: string;
  files?: string[];
  breaking?: boolean;
  reasoning?: { explanation: string; confidence?: number };
}

interface PlanData {
  plan?: { commits: Commit[] };
}

interface StatusData {
  filesChanged: number;
  hasPlan: boolean;
  planStatus: string;
}

// Semantic commit type → Ant Design token color name
const TYPE_COLOR_MAP: Record<string, string> = {
  feat: 'green', fix: 'red', docs: 'blue', style: 'purple',
  refactor: 'cyan', test: 'magenta', chore: 'default', perf: 'gold',
  ci: 'blue', build: 'geekblue',
};

export function CommitPlanTab({ scope }: CommitPlanTabProps) {
  const { token } = useToken();
  const notify = useNotification();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMsg, setEditMsg] = useState('');
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [allowSecrets, setAllowSecrets] = useState(false);

  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useData<StatusData>(
    '/v1/plugins/commit/status', { params: { scope }, enabled: !!scope },
  );
  const { data: planData, refetch: refetchPlan } = useData<PlanData>(
    '/v1/plugins/commit/plan', { params: { scope }, enabled: !!scope },
  );

  const refetchAll = () => { void refetchStatus(); void refetchPlan(); };

  const generate = useMutateData<{ scope: string; allowSecrets: boolean; autoConfirm: boolean }, any>('/v1/plugins/commit/generate');
  const apply = useMutateData<{ scope: string; commitIds?: string[] }, any>('/v1/plugins/commit/apply');
  const push = useMutateData<{ scope: string }, any>('/v1/plugins/commit/push');
  const reset = useMutateData<{ scope: string }, any>('/v1/plugins/commit/plan', 'DELETE');
  const patch = useMutateData<{ scope: string; commitId: string; message: string }, any>('/v1/plugins/commit/plan', 'PATCH');
  const regenerate = useMutateData<{ scope: string; commitId: string }, any>('/v1/plugins/commit/regenerate-commit');

  const filesChanged = statusData?.filesChanged ?? 0;
  const commits = planData?.plan?.commits ?? [];
  const hasPlan = commits.length > 0;
  const planStatus = hasPlan ? (statusData?.planStatus ?? 'ready') : 'idle';
  const isAnyLoading = generate.isLoading || apply.isLoading || push.isLoading || reset.isLoading;

  const handleGenerate = () => {
    if (allowSecrets) {
      UIModalConfirm({
        title: 'Allow Secrets?',
        icon: <UIIcon name="ExclamationCircleOutlined" />,
        content: 'Files may contain secrets. This bypasses security checks.',
        okText: 'Proceed',
        okType: 'danger',
        onOk: () => generate.mutate({ scope, allowSecrets: true, autoConfirm: true }, { onSuccess: refetchAll }),
      });
    } else {
      generate.mutate({ scope, allowSecrets: false, autoConfirm: false }, {
        onSuccess: (data: any) => {
          refetchAll();
          if (data.secretsDetected && data.secrets) {
            UIModalError({
              title: 'Secrets Detected',
              width: 600,
              content: (
                <div>
                  <UIAlert message={data.message} variant="error" showIcon style={{ marginBottom: 16 }} />
                  <Text strong>{data.secrets.length} potential secret(s) found.</Text>
                  <div style={{ maxHeight: 300, overflow: 'auto', marginTop: 8 }}>
                    {data.secrets.map((s: any, i: number) => (
                      <UICard key={i} size="small" style={{ marginBottom: 8 }}>
                        <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.file}:{s.line}</Text>
                        <br />
                        <Text type="secondary">{s.type}: {s.matched}</Text>
                      </UICard>
                    ))}
                  </div>
                </div>
              ),
            });
          }
        },
      });
    }
  };

  const handleApply = (commitIds?: string[]) => {
    apply.mutate({ scope, commitIds }, {
      onSuccess: (data: any) => {
        refetchAll();
        if (data.result?.success) {
          notify.success(`${data.result.appliedCommits.length} commit(s) applied`);
          setSelected(new Set());
        }
      },
      onError: (e: Error) => notify.error(`Apply failed: ${e.message}`),
    });
  };

  const handlePush = () => {
    push.mutate({ scope }, {
      onSuccess: (data: any) => {
        refetchStatus();
        if (data.result?.success) {
          notify.success(`Pushed ${data.result.commitsPushed} commit(s) to ${data.result.remote}/${data.result.branch}`);
        } else {
          notify.error(data.result?.error ?? 'Push failed');
        }
      },
      onError: (e: Error) => notify.error(`Push failed: ${e.message}`),
    });
  };

  const handleReset = () => {
    reset.mutate({ scope }, {
      onSuccess: () => { refetchAll(); notify.success('Plan reset'); setSelected(new Set()); setExpanded(new Set()); },
      onError: (e: Error) => notify.error(`Reset failed: ${e.message}`),
    });
  };

  const handleSaveEdit = (commitId: string) => {
    patch.mutate({ scope, commitId, message: editMsg }, {
      onSuccess: () => { refetchPlan(); setEditingId(null); notify.success('Message updated'); },
      onError: (e: Error) => notify.error(`Update failed: ${e.message}`),
    });
  };

  const handleRegenerate = (commitId: string) => {
    setRegeneratingId(commitId);
    regenerate.mutate({ scope, commitId }, {
      onSuccess: () => { refetchPlan(); setRegeneratingId(null); notify.success('Commit regenerated'); },
      onError: (e: Error) => { setRegeneratingId(null); notify.error(`Regenerate failed: ${e.message}`); },
    });
  };

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    return next;
  };

  if (!scope) {
    return <UIEmptyState description="Select a repository to continue" />;
  }
  if (statusLoading) {
    return <UISpin size="large" style={{ display: 'block', margin: '48px auto' }} />;
  }

  const statusBadge: Record<string, { text: string; status: 'default' | 'processing' | 'success' }> = {
    idle: { text: 'No Plan', status: 'default' },
    ready: { text: 'Ready to Apply', status: 'processing' },
    applied: { text: 'Applied', status: 'success' },
    pushed: { text: 'Pushed', status: 'success' },
  };
  const badge = statusBadge[planStatus] ?? statusBadge.idle!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: token.marginSM }}>
      {/* Summary bar */}
      <UICard size="small">
        <UIFlex justify="between" align="center">
          <UISpace size={24}>
            <UIBadge {...badge} />
            <Text type="secondary">{commits.length} commit{commits.length !== 1 ? 's' : ''}</Text>
            <Text type="secondary">{filesChanged} file{filesChanged !== 1 ? 's' : ''} changed</Text>
          </UISpace>
          {hasPlan && (
            <UISpace size={8}>
              {planStatus === 'ready' && (
                selected.size > 0 ? (
                  <UIButton variant="primary" size="small" onClick={() => handleApply([...selected])} loading={apply.isLoading} disabled={isAnyLoading}>
                    Apply Selected ({selected.size})
                  </UIButton>
                ) : (
                  <UIButton variant="primary" size="small" onClick={() => handleApply()} loading={apply.isLoading} disabled={isAnyLoading}>
                    Apply All
                  </UIButton>
                )
              )}
              {(planStatus === 'applied' || planStatus === 'pushed') && (
                <UIButton size="small" icon={<UIIcon name="CloudUploadOutlined" />} onClick={handlePush} loading={push.isLoading} disabled={isAnyLoading}>
                  Push
                </UIButton>
              )}
              <UIButton size="small" icon={<UIIcon name="ReloadOutlined" />} onClick={handleGenerate} loading={generate.isLoading} disabled={isAnyLoading}>
                Regenerate
              </UIButton>
              <UIPopconfirm title="Reset commit plan?" description="This deletes the current plan." onConfirm={handleReset} okText="Reset" okType="danger">
                <span>
                  <UIButton size="small" danger icon={<UIIcon name="DeleteOutlined" />} loading={reset.isLoading} disabled={isAnyLoading}>
                    Reset
                  </UIButton>
                </span>
              </UIPopconfirm>
            </UISpace>
          )}
        </UIFlex>
      </UICard>

      {/* Generating */}
      {generate.isLoading && (
        <UICard style={{ textAlign: 'center', padding: '48px 0' }}>
          <UISpin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Analyzing {filesChanged} files...</Text>
          </div>
        </UICard>
      )}

      {/* Empty state */}
      {(!hasPlan || commits.length === 0) && !generate.isLoading && (
        <UICard>
          <UIEmptyState
            icon={<UIIcon name="FileOutlined" />}
            title="No commit plan yet"
            description={filesChanged > 0 ? `${filesChanged} file${filesChanged !== 1 ? 's' : ''} changed` : undefined}
          >
            <UISpace direction="vertical" align="center">
              <UICheckbox checked={allowSecrets} onChange={(v) => setAllowSecrets(v)}>
                <Text type="secondary" style={{ fontSize: 13 }}>Allow secrets</Text>
              </UICheckbox>
              <UIButton variant="primary" icon={<UIIcon name="ThunderboltOutlined" />} onClick={handleGenerate} disabled={filesChanged === 0}>
                Generate Plan
              </UIButton>
            </UISpace>
          </UIEmptyState>
        </UICard>
      )}

      {/* Commit list */}
      {!generate.isLoading && commits.length > 0 && commits.map((commit) => {
        const isExpanded = expanded.has(commit.id);
        const isEditing = editingId === commit.id;
        const isRegenerating = regeneratingId === commit.id;
        const isSelected = selected.has(commit.id);
        const typeColor = TYPE_COLOR_MAP[commit.type] ?? 'default';

        return (
          <UICard key={commit.id} size="small" style={{ opacity: isRegenerating ? 0.6 : 1 }}>
            <UIFlex align="center" gap={8} style={{ marginBottom: isExpanded ? token.marginSM : 0 }}>
              {planStatus === 'ready' && (
                <span onClick={(e) => e.stopPropagation()}>
                  <UICheckbox checked={isSelected} onChange={() => setSelected(toggle(selected, commit.id))} />
                </span>
              )}

              <UIIcon
                name="RightOutlined"
                style={{ fontSize: 11, cursor: 'pointer', color: token.colorTextTertiary, transform: isExpanded ? 'rotate(90deg)' : undefined, transition: 'transform 0.2s' }}
                onClick={() => setExpanded(toggle(expanded, commit.id))}
              />

              <UITag color={typeColor} style={{ margin: 0 }}>{commit.type}</UITag>

              <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => setExpanded(toggle(expanded, commit.id))}>
                {isEditing ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <UIInput size="small" value={editMsg} onChange={(v) => setEditMsg(v)} onPressEnter={() => handleSaveEdit(commit.id)} autoFocus style={{ flex: 1 }} />
                    <UIButton size="small" variant="text" icon={<UIIcon name="CheckOutlined" />} onClick={() => handleSaveEdit(commit.id)} loading={patch.isLoading} />
                    <UIButton size="small" variant="text" icon={<UIIcon name="CloseOutlined" />} onClick={() => setEditingId(null)} />
                  </div>
                ) : (
                  <Text ellipsis>
                    {commit.scope && <Text type="secondary">({commit.scope}){' '}</Text>}
                    {commit.message}
                  </Text>
                )}
              </div>

              {commit.breaking && <UITag color="red" style={{ margin: 0 }}>BREAKING</UITag>}

              <UITooltip title={`${commit.files?.length ?? 0} files`}>
                <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{commit.files?.length ?? 0} files</Text>
              </UITooltip>

              {commit.reasoning?.confidence !== undefined && (
                <UITooltip title="AI confidence">
                  <Text type="secondary" style={{ fontSize: 12 }}>{(commit.reasoning.confidence * 100).toFixed(0)}%</Text>
                </UITooltip>
              )}

              {planStatus === 'ready' && !isEditing && (
                <UIDropdown trigger={['click']} menu={{
                  items: [
                    { key: 'edit', label: 'Edit message', icon: <UIIcon name="EditOutlined" />, onClick: () => { setEditingId(commit.id); setEditMsg(commit.message); } },
                    { key: 'regen', label: 'Regenerate', icon: <UIIcon name="ReloadOutlined" />, onClick: () => handleRegenerate(commit.id) },
                  ],
                }}>
                  <UIButton variant="text" size="small" icon={<UIIcon name="MoreOutlined" />} onClick={(e) => e.stopPropagation()} />
                </UIDropdown>
              )}
            </UIFlex>

            {isExpanded && (
              <div style={{ paddingTop: token.paddingSM }}>
                {isRegenerating && (
                  <UIFlex justify="center" style={{ padding: token.padding }}>
                    <UISpin size="small" />
                    <Text type="secondary" style={{ marginLeft: 8 }}>Regenerating...</Text>
                  </UIFlex>
                )}
                {commit.body && (
                  <Text type="secondary" style={{ whiteSpace: 'pre-wrap', display: 'block', marginBottom: token.marginSM }}>
                    {commit.body}
                  </Text>
                )}
                {commit.files && commit.files.length > 0 && (
                  <div style={{ marginBottom: token.marginSM }}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      {commit.files.length} file{commit.files.length !== 1 ? 's' : ''}
                    </Text>
                    <UICard size="small" style={{ background: token.colorFillAlter }}>
                      {commit.files.map((file, i) => (
                        <div key={i} style={{ padding: '2px 0', fontFamily: 'monospace', fontSize: 12 }}>{file}</div>
                      ))}
                    </UICard>
                  </div>
                )}
                {commit.reasoning && (
                  <UIAlert
                    message="AI Reasoning"
                    description={
                      <Text type="secondary">
                        {commit.reasoning.explanation}
                        {commit.reasoning.confidence !== undefined && (
                          <> ({(commit.reasoning.confidence * 100).toFixed(0)}% confidence)</>
                        )}
                      </Text>
                    }
                    variant="info"
                  />
                )}
              </div>
            )}
          </UICard>
        );
      })}
    </div>
  );
}

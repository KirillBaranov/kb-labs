import { UISpace, UICard, UIText, UITag, UIIcon, useUITheme } from '@kb-labs/studio-ui-kit';

interface PlatformServicesProps {
  permissions: any;
}

export function PlatformServices({ permissions }: PlatformServicesProps) {
  const { token } = useUITheme();

  return (
    <UICard
      title={
        <UISpace>
          <UIIcon name="DatabaseOutlined" />
          <span>Platform Services</span>
        </UISpace>
      }
    >
      <UIText color="secondary" style={{ marginBottom: 16, display: 'block' }}>
        Access to KB Labs platform services like LLM, vector store, cache, and analytics.
      </UIText>
      <UISpace direction="vertical" size="middle" style={{ width: '100%' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          {/* LLM Service */}
          {permissions.llm !== undefined && (
            <UICard size="small">
              <UISpace direction="vertical" size="small">
                <UISpace>
                  {permissions.llm ? (
                    <UIIcon name="CheckCircleOutlined" style={{ color: token.colorSuccess }} />
                  ) : (
                    <UIIcon name="WarningOutlined" style={{ color: token.colorTextDisabled }} />
                  )}
                  <UIText weight="semibold">LLM Service</UIText>
                </UISpace>
                {typeof permissions.llm === 'object' && permissions.llm.models && (
                  <div>
                    <UIText color="secondary" style={{ fontSize: token.fontSizeSM }}>
                      Models:
                    </UIText>
                    <div style={{ marginTop: 4 }}>
                      <UISpace wrap size="small">
                        {permissions.llm.models.map((model: string, idx: number) => (
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
          {permissions.vectorStore !== undefined && (
            <UICard size="small">
              <UISpace direction="vertical" size="small">
                <UISpace>
                  {permissions.vectorStore ? (
                    <UIIcon name="CheckCircleOutlined" style={{ color: token.colorSuccess }} />
                  ) : (
                    <UIIcon name="WarningOutlined" style={{ color: token.colorTextDisabled }} />
                  )}
                  <UIText weight="semibold">Vector Store</UIText>
                </UISpace>
                {typeof permissions.vectorStore === 'object' &&
                  permissions.vectorStore.collections && (
                    <div>
                      <UIText color="secondary" style={{ fontSize: token.fontSizeSM }}>
                        Collections:
                      </UIText>
                      <div style={{ marginTop: 4 }}>
                        <UISpace wrap size="small">
                          {permissions.vectorStore.collections.map((col: string, idx: number) => (
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
          {permissions.cache !== undefined && (
            <UICard size="small">
              <UISpace direction="vertical" size="small">
                <UISpace>
                  {permissions.cache ? (
                    <UIIcon name="CheckCircleOutlined" style={{ color: token.colorSuccess }} />
                  ) : (
                    <UIIcon name="WarningOutlined" style={{ color: token.colorTextDisabled }} />
                  )}
                  <UIText weight="semibold">Cache</UIText>
                </UISpace>
                {typeof permissions.cache === 'object' && permissions.cache.namespaces && (
                  <div>
                    <UIText color="secondary" style={{ fontSize: token.fontSizeSM }}>
                      Namespaces:
                    </UIText>
                    <div style={{ marginTop: 4 }}>
                      <UISpace wrap size="small">
                        {permissions.cache.namespaces.map((ns: string, idx: number) => (
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
          {permissions.storage !== undefined && (
            <UICard size="small">
              <UISpace direction="vertical" size="small">
                <UISpace>
                  {permissions.storage ? (
                    <UIIcon name="CheckCircleOutlined" style={{ color: token.colorSuccess }} />
                  ) : (
                    <UIIcon name="WarningOutlined" style={{ color: token.colorTextDisabled }} />
                  )}
                  <UIText weight="semibold">Storage</UIText>
                </UISpace>
                {typeof permissions.storage === 'object' && permissions.storage.paths && (
                  <div>
                    <UIText color="secondary" style={{ fontSize: token.fontSizeSM }}>
                      Paths:
                    </UIText>
                    <div style={{ marginTop: 4 }}>
                      <UISpace wrap size="small">
                        {permissions.storage.paths.map((path: string, idx: number) => (
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
          {permissions.analytics !== undefined && (
            <UICard size="small">
              <UISpace>
                {permissions.analytics ? (
                  <UIIcon name="CheckCircleOutlined" style={{ color: token.colorSuccess }} />
                ) : (
                  <UIIcon name="WarningOutlined" style={{ color: token.colorTextDisabled }} />
                )}
                <UIText weight="semibold">Analytics</UIText>
              </UISpace>
            </UICard>
          )}

          {/* Embeddings */}
          {permissions.embeddings !== undefined && (
            <UICard size="small">
              <UISpace>
                {permissions.embeddings ? (
                  <UIIcon name="CheckCircleOutlined" style={{ color: token.colorSuccess }} />
                ) : (
                  <UIIcon name="WarningOutlined" style={{ color: token.colorTextDisabled }} />
                )}
                <UIText weight="semibold">Embeddings</UIText>
              </UISpace>
            </UICard>
          )}

          {/* Events */}
          {permissions.events !== undefined && (
            <UICard size="small">
              <UISpace direction="vertical" size="small">
                <UISpace>
                  {permissions.events ? (
                    <UIIcon name="CheckCircleOutlined" style={{ color: token.colorSuccess }} />
                  ) : (
                    <UIIcon name="WarningOutlined" style={{ color: token.colorTextDisabled }} />
                  )}
                  <UIText weight="semibold">Event Bus</UIText>
                </UISpace>
                {typeof permissions.events === 'object' && (
                  <div>
                    {permissions.events.publish && permissions.events.publish.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <UIText color="secondary" style={{ fontSize: token.fontSizeSM }}>
                          Publish:
                        </UIText>
                        <div style={{ marginTop: 4 }}>
                          <UISpace wrap size="small">
                            {permissions.events.publish.map((evt: string, idx: number) => (
                              <UITag key={idx} color="green" style={{ fontSize: 11 }}>
                                {evt}
                              </UITag>
                            ))}
                          </UISpace>
                        </div>
                      </div>
                    )}
                    {permissions.events.subscribe && permissions.events.subscribe.length > 0 && (
                      <div>
                        <UIText color="secondary" style={{ fontSize: token.fontSizeSM }}>
                          Subscribe:
                        </UIText>
                        <div style={{ marginTop: 4 }}>
                          <UISpace wrap size="small">
                            {permissions.events.subscribe.map((evt: string, idx: number) => (
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
  );
}

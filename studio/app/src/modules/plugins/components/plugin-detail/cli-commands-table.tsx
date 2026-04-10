import { UITable, UISpace, UICard, UIText, UITag, UITitle, useUITheme, type UITableColumn } from '@kb-labs/studio-ui-kit';

interface CLICommandsTableProps {
  commands: any[];
}

export function CLICommandsTable({ commands }: CLICommandsTableProps) {
  const { token } = useUITheme();

  const columns: UITableColumn<any>[] = [
    {
      title: 'Command',
      dataIndex: 'id',
      key: 'id',
      render: (id, record) => (
        <div>
          <UIText weight="semibold" style={{ fontFamily: token.fontFamilyCode }}>
            {record.group ? `${record.group}:${id}` : id}
          </UIText>
        </div>
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
      render: (flags) => {
        return flags?.length > 0 ? (
          <UISpace wrap>
            {flags.map((flag: any) => (
              <UITag key={flag.name}>
                --{flag.name}
                {flag.required && <UIText color="error">*</UIText>}
              </UITag>
            ))}
          </UISpace>
        ) : (
          <UIText color="secondary">None</UIText>
        );
      },
    },
    {
      title: 'Handler',
      dataIndex: 'handler',
      key: 'handler',
      render: (handler) => (
        <UIText style={{ fontSize: 11, fontFamily: token.fontFamilyCode }}>
          {handler}
        </UIText>
      ),
    },
  ];

  return (
    <UICard>
      <UITable
        columns={columns}
        dataSource={commands}
        rowKey="id"
        pagination={false}
        expandable={{
          expandedRowRender: (record) =>
            record.flags && record.flags.length > 0 ? (
              <div style={{ margin: 0, paddingLeft: 48 }}>
                <UITitle level={5}>Flags</UITitle>
                {record.flags.map((flag: any) => (
                  <div key={flag.name} style={{ marginBottom: 8 }}>
                    <UIText style={{ fontFamily: token.fontFamilyCode }}>
                      --{flag.name}
                    </UIText>
                    {flag.alias && <UIText color="secondary"> (-{flag.alias})</UIText>}
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
                      <UIText color="secondary">{flag.description || '--'}</UIText>
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

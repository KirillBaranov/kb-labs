import { UITable, UICard, UIText, useUITheme, type UITableColumn } from '@kb-labs/studio-ui-kit';

interface WorkflowsTableProps {
  handlers: any[];
}

export function WorkflowsTable({ handlers }: WorkflowsTableProps) {
  const { token } = useUITheme();

  const columns: UITableColumn<any>[] = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      render: (id) => <UIText style={{ fontFamily: token.fontFamilyCode }}>{id}</UIText>,
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
        <UIText style={{ fontSize: 11, fontFamily: token.fontFamilyCode }}>
          {handler}
        </UIText>
      ),
    },
  ];

  return (
    <UICard>
      <UITable columns={columns} dataSource={handlers} rowKey="id" pagination={false} />
    </UICard>
  );
}

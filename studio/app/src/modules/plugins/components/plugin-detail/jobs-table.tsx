import { UITable, UICard, UIText, UITag, useUITheme, type UITableColumn } from '@kb-labs/studio-ui-kit';

interface JobsTableProps {
  jobs: any[];
}

export function JobsTable({ jobs }: JobsTableProps) {
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
      title: 'Schedule',
      dataIndex: 'schedule',
      key: 'schedule',
      render: (schedule) =>
        schedule ? (
          <UITag color="orange">{schedule}</UITag>
        ) : (
          <UIText color="secondary">Manual</UIText>
        ),
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
        <UIText style={{ fontSize: 11, fontFamily: token.fontFamilyCode }}>
          {handler}
        </UIText>
      ),
    },
  ];

  return (
    <UICard>
      <UITable columns={columns} dataSource={jobs} rowKey="id" pagination={false} />
    </UICard>
  );
}

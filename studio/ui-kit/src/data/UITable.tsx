/**
 * UITable component - Data table
 *
 * Wraps Ant Design Table with simplified API.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Table as AntTable } from 'antd';
import type { ColumnType } from 'antd/es/table';
import type { ExpandableConfig } from 'antd/es/table/interface';

export interface UITableColumn<T = any> extends ColumnType<T> {
  /** Column key */
  key: string;
  /** Column title */
  title: string;
  /** Data index (object key) */
  dataIndex?: string;
  /** Custom render function */
  render?: (value: any, record: T, index: number) => React.ReactNode;
  /** Column width */
  width?: number | string;
  /** Sortable column */
  sorter?: boolean | ((a: T, b: T) => number);
  /** Filterable column */
  filters?: { text: string; value: any }[];
  /** Default filter value */
  defaultFilteredValue?: any[];
  /** Custom filter function */
  onFilter?: (value: any, record: T) => boolean;
  /** Fixed column */
  fixed?: 'left' | 'right';
  /** Ellipsis text */
  ellipsis?: boolean;
}

export interface UITableProps<T = any> {
  /** Table columns */
  columns: UITableColumn<T>[];
  /** Table data */
  dataSource: T[];
  /** Row key field */
  rowKey?: string | ((record: T) => string);
  /** Loading state */
  loading?: boolean;
  /** Show pagination */
  pagination?: false | { pageSize?: number; current?: number; total?: number };
  /** Row selection */
  rowSelection?: {
    selectedRowKeys?: React.Key[];
    onChange?: (selectedRowKeys: React.Key[], selectedRows: T[]) => void;
  };
  /** Row click handler */
  onRow?: (record: T) => {
    onClick?: () => void;
    onDoubleClick?: () => void;
  };
  /** Table size */
  size?: 'small' | 'middle' | 'large';
  /** Show border */
  bordered?: boolean;
  /** Expandable row config */
  expandable?: ExpandableConfig<T>;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
  /** Scroll config */
  scroll?: { x?: number | string | true; y?: number | string };
}

/**
 * UITable - Data table
 *
 * @example
 * ```tsx
 * <UITable
 *   columns={[
 *     { key: 'name', title: 'Name', dataIndex: 'name', sorter: true },
 *     { key: 'age', title: 'Age', dataIndex: 'age', width: 100 },
 *     { key: 'status', title: 'Status', dataIndex: 'status',
 *       render: (status) => <UIBadge variant={status}>{status}</UIBadge>
 *     },
 *   ]}
 *   dataSource={data}
 *   rowKey="id"
 *   loading={isLoading}
 * />
 *
 * <UITable
 *   columns={columns}
 *   dataSource={workflows}
 *   rowKey="workflowId"
 *   rowSelection={{
 *     selectedRowKeys,
 *     onChange: setSelectedRowKeys,
 *   }}
 *   onRow={(record) => ({
 *     onClick: () => handleRowClick(record),
 *   })}
 * />
 * ```
 */
export function UITable<T extends Record<string, any> = any>({
  columns,
  dataSource,
  rowKey = 'id',
  loading,
  pagination,
  rowSelection,
  onRow,
  size = 'middle',
  bordered = false,
  expandable,
  className,
  style,
  scroll,
}: UITableProps<T>) {
  return (
    <AntTable<T>
      columns={columns}
      dataSource={dataSource}
      rowKey={rowKey}
      loading={loading}
      pagination={pagination}
      rowSelection={rowSelection}
      onRow={onRow}
      size={size}
      bordered={bordered}
      expandable={expandable}
      className={className}
      style={style}
      scroll={scroll}
    />
  );
}

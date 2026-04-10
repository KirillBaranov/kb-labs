/**
 * UIList component - List display
 *
 * Wraps Ant Design List for displaying collections of items.
 */

import * as React from 'react';
import { List as AntList, type ListProps as AntListProps } from 'antd';

export interface UIListProps<T> extends AntListProps<T> {}

export function UIList<T>(props: UIListProps<T>) {
  return <AntList<T> {...props} />;
}

export function UIListItem(props: React.ComponentProps<typeof AntList.Item>) {
  return <AntList.Item {...props} />;
}

export function UIListItemMeta(props: React.ComponentProps<typeof AntList.Item.Meta>) {
  return <AntList.Item.Meta {...props} />;
}

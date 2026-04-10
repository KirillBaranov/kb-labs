/**
 * UITree component - Tree view
 *
 * Wraps Ant Design Tree for hierarchical data display.
 */

import * as React from 'react';
import { Tree as AntTree, type TreeProps as AntTreeProps } from 'antd';

export interface UITreeProps extends AntTreeProps {}

export function UITree(props: UITreeProps) {
  return <AntTree {...props} />;
}

export function UITreeDirectoryTree(props: React.ComponentProps<typeof AntTree.DirectoryTree>) {
  return <AntTree.DirectoryTree {...props} />;
}

export function UITreeNode(props: React.ComponentProps<typeof AntTree.TreeNode>) {
  return <AntTree.TreeNode {...props} />;
}

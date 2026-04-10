import * as React from 'react';
import { UIEmptyState as UIEmptyStateBase, UIButton } from '@kb-labs/studio-ui-kit';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  // Convert icon component to React element if it's a component
  const iconElement = React.isValidElement(icon)
    ? icon
    : icon && typeof icon === 'function'
    ? React.createElement(icon as React.ComponentType)
    : icon;

  return (
    <UIEmptyStateBase
      icon={iconElement}
      title={title}
      description={description}
      action={action ? <UIButton onClick={action.onClick}>{action.label}</UIButton> : undefined}
    />
  );
}


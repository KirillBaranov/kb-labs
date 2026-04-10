/**
 * UIAccordion component - Collapsible panels
 *
 * Wraps Ant Design Collapse with simplified API.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Collapse as AntCollapse } from 'antd';

export interface UIAccordionItem {
  /** Panel key */
  key: string;
  /** Panel header/title */
  label: string;
  /** Panel content */
  children: React.ReactNode;
  /** Extra content in header */
  extra?: React.ReactNode;
  /** Show arrow */
  showArrow?: boolean;
  /** Collapsible trigger */
  collapsible?: 'header' | 'icon' | 'disabled';
}

export interface UIAccordionProps {
  /** Accordion items */
  items: UIAccordionItem[];
  /** Active panel keys */
  activeKey?: string | string[];
  /** Default active panel keys */
  defaultActiveKey?: string | string[];
  /** Accordion mode (allow multiple open) */
  accordion?: boolean;
  /** Bordered style */
  bordered?: boolean;
  /** Ghost style (no border, no background) */
  ghost?: boolean;
  /** Size */
  size?: 'small' | 'middle' | 'large';
  /** Change handler */
  onChange?: (keys: string | string[]) => void;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * UIAccordion - Collapsible panels
 *
 * @example
 * ```tsx
 * <UIAccordion
 *   items={[
 *     {
 *       key: '1',
 *       label: 'Section 1',
 *       children: <div>Content 1</div>,
 *     },
 *     {
 *       key: '2',
 *       label: 'Section 2',
 *       children: <div>Content 2</div>,
 *     },
 *   ]}
 *   defaultActiveKey={['1']}
 * />
 *
 * <UIAccordion
 *   accordion
 *   items={sections}
 *   onChange={(key) => console.log('Active:', key)}
 * />
 *
 * <UIAccordion
 *   ghost
 *   items={[
 *     {
 *       key: 'advanced',
 *       label: 'Advanced Options',
 *       children: <AdvancedForm />,
 *       extra: <UIBadge>New</UIBadge>,
 *     },
 *   ]}
 * />
 * ```
 */
export function UIAccordion({
  items,
  activeKey,
  defaultActiveKey,
  accordion = false,
  bordered = true,
  ghost = false,
  size = 'middle',
  onChange,
  className,
  style,
}: UIAccordionProps) {
  const collapseItems = items.map((item) => ({
    key: item.key,
    label: item.label,
    children: item.children,
    extra: item.extra,
    showArrow: item.showArrow,
    collapsible: item.collapsible,
  }));

  return (
    <AntCollapse
      items={collapseItems}
      activeKey={activeKey}
      defaultActiveKey={defaultActiveKey}
      accordion={accordion}
      bordered={bordered}
      ghost={ghost}
      size={size}
      onChange={onChange}
      className={className}
      style={style}
    />
  );
}

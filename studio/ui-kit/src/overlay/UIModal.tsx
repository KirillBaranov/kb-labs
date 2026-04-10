/**
 * UIModal component - Modal dialog
 *
 * Wraps Ant Design Modal with simplified API.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Modal as AntModal } from 'antd';

export type UIModalWidth = 'small' | 'default' | 'large' | 'full';

export interface UIModalProps {
  /** Modal open state */
  open: boolean;
  /** Modal title */
  title?: React.ReactNode;
  /** Modal content */
  children: React.ReactNode;
  /** Modal width preset */
  width?: UIModalWidth | number;
  /** Show close button */
  closable?: boolean;
  /** Mask closable (click outside to close) */
  maskClosable?: boolean;
  /** Show footer */
  footer?: React.ReactNode | null;
  /** OK button text */
  okText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** OK button loading */
  confirmLoading?: boolean;
  /** OK button handler */
  onOk?: () => void;
  /** Cancel button handler */
  onCancel?: () => void;
  /** Close handler */
  onClose?: () => void;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * UIModal - Modal dialog
 *
 * @example
 * ```tsx
 * <UIModal
 *   open={isOpen}
 *   title="Confirm Action"
 *   onOk={handleOk}
 *   onCancel={handleCancel}
 * >
 *   Are you sure you want to proceed?
 * </UIModal>
 *
 * <UIModal
 *   open={isOpen}
 *   title="Create Workflow"
 *   width="large"
 *   confirmLoading={isSubmitting}
 *   onOk={handleSubmit}
 *   onCancel={() => setIsOpen(false)}
 * >
 *   <WorkflowForm />
 * </UIModal>
 *
 * <UIModal
 *   open={isOpen}
 *   title="Details"
 *   footer={null}
 *   onCancel={() => setIsOpen(false)}
 * >
 *   <DetailsView />
 * </UIModal>
 * ```
 */
export function UIModal({
  open,
  title,
  children,
  width = 'default',
  closable = true,
  maskClosable = true,
  footer,
  okText,
  cancelText,
  confirmLoading,
  onOk,
  onCancel,
  onClose,
  className,
  style,
}: UIModalProps) {
  const widthMap: Record<UIModalWidth, number> = {
    small: 416,
    default: 520,
    large: 800,
    full: window.innerWidth - 64,
  };

  const modalWidth = typeof width === 'number' ? width : widthMap[width];

  return (
    <AntModal
      open={open}
      title={title}
      width={modalWidth}
      closable={closable}
      maskClosable={maskClosable}
      footer={footer}
      okText={okText}
      cancelText={cancelText}
      confirmLoading={confirmLoading}
      onOk={onOk}
      onCancel={onCancel || onClose}
      className={className}
      style={style}
    >
      {children}
    </AntModal>
  );
}

/**
 * UIModalConfirm - Confirmation modal shorthand
 */
export const UIModalConfirm = AntModal.confirm;

/**
 * UIModalInfo - Info modal shorthand
 */
export const UIModalInfo = AntModal.info;

/**
 * UIModalSuccess - Success modal shorthand
 */
export const UIModalSuccess = AntModal.success;

/**
 * UIModalError - Error modal shorthand
 */
export const UIModalError = AntModal.error;

/**
 * UIModalWarning - Warning modal shorthand
 */
export const UIModalWarning = AntModal.warning;

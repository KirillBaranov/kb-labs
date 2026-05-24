'use client';

import * as React from 'react';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './toast';
import { useToast } from '../../hooks/useToast';

export function Toaster() {
  const { toasts, remove } = useToast();

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, variant, action, open }) => (
        <Toast
          key={id}
          variant={variant}
          open={open}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              // Small delay to allow close animation to finish
              setTimeout(() => remove(id), 300);
            }
          }}
        >
          <div className="flex-1 grid gap-1">
            {title && <ToastTitle className="text-sm font-semibold">{title}</ToastTitle>}
            {description && <ToastDescription className="text-sm opacity-80">{description}</ToastDescription>}
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}

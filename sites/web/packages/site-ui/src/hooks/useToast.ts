'use client';

import * as React from 'react';
import type { ToastProps, ToastVariant } from '../components/ui/toast';

export interface ToastInput {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  action?: React.ReactElement;
}

interface ToastState extends ToastInput {
  id: string;
  open: boolean;
}

type ToastAction =
  | { type: 'add'; toast: ToastState }
  | { type: 'dismiss'; id: string }
  | { type: 'remove'; id: string };

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return String(count);
}

const listeners: Array<(state: ToastState[]) => void> = [];
let memoryState: ToastState[] = [];

function dispatch(action: ToastAction) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((l) => l(memoryState));
}

function reducer(state: ToastState[], action: ToastAction): ToastState[] {
  switch (action.type) {
    case 'add':
      return [...state, action.toast];
    case 'dismiss':
      return state.map((t) => t.id === action.id ? { ...t, open: false } : t);
    case 'remove':
      return state.filter((t) => t.id !== action.id);
    default:
      return state;
  }
}

export function toast(input: ToastInput) {
  const id = genId();
  const dismiss = () => dispatch({ type: 'dismiss', id });

  dispatch({
    type: 'add',
    toast: { ...input, id, open: true },
  });

  return { id, dismiss };
}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToastState[]>(memoryState);

  React.useEffect(() => {
    listeners.push(setToasts);
    return () => {
      const idx = listeners.indexOf(setToasts);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  return {
    toasts,
    toast,
    dismiss: (id: string) => dispatch({ type: 'dismiss', id }),
    remove: (id: string) => dispatch({ type: 'remove', id }),
  };
}

export type { ToastProps };

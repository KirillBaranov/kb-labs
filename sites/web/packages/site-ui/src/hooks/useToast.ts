'use client';

import * as React from 'react';
import type { ToastProps, ToastVariant } from '../components/ui/toast';

const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 4000;

type ToastInput = {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  action?: React.ReactElement;
};

type ToastState = ToastInput & {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Action =
  | { type: 'ADD'; toast: ToastState }
  | { type: 'UPDATE'; id: string; toast: Partial<ToastState> }
  | { type: 'DISMISS'; id: string }
  | { type: 'REMOVE'; id: string };

let count = 0;
function genId() {
  return `toast-${++count}`;
}

const listeners: Array<(state: ToastState[]) => void> = [];
let memoryState: ToastState[] = [];

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((l) => l(memoryState));
}

function reducer(state: ToastState[], action: Action): ToastState[] {
  switch (action.type) {
    case 'ADD':
      return [action.toast, ...state].slice(0, TOAST_LIMIT);
    case 'UPDATE':
      return state.map((t) => (t.id === action.id ? { ...t, ...action.toast } : t));
    case 'DISMISS':
      return state.map((t) => (t.id === action.id ? { ...t, open: false } : t));
    case 'REMOVE':
      return state.filter((t) => t.id !== action.id);
  }
}

export function toast(input: ToastInput) {
  const id = genId();

  const dismiss = () => dispatch({ type: 'DISMISS', id });

  dispatch({
    type: 'ADD',
    toast: {
      ...input,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  setTimeout(() => {
    dismiss();
    setTimeout(() => dispatch({ type: 'REMOVE', id }), 300);
  }, input.duration ?? TOAST_REMOVE_DELAY);

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

  return { toasts, toast, dismiss: (id: string) => dispatch({ type: 'DISMISS', id }) };
}

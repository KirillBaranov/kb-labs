/**
 * UIMessage - Imperative message API
 *
 * Wraps antd's message API to decouple app from antd internals.
 *
 * @example
 * ```tsx
 * import { UIMessage } from '@kb-labs/studio-ui-kit';
 *
 * UIMessage.success('Operation completed');
 * UIMessage.error('Something went wrong');
 * UIMessage.loading('Processing...');
 * ```
 *
 * For hook-based usage (with context holder):
 * ```tsx
 * import { useUIMessage } from '@kb-labs/studio-ui-kit';
 *
 * function MyComponent() {
 *   const [messageApi, contextHolder] = useUIMessage();
 *   return (
 *     <>
 *       {contextHolder}
 *       <button onClick={() => messageApi.success('Done!')}>Click</button>
 *     </>
 *   );
 * }
 * ```
 */

import { message, type MessageArgsProps } from 'antd';

type MessageFunc = (content: React.ReactNode | MessageArgsProps, duration?: number, onClose?: () => void) => Promise<boolean>;

export interface UIMessageAPI {
  success: MessageFunc;
  error: MessageFunc;
  info: MessageFunc;
  warning: MessageFunc;
  loading: MessageFunc;
  open: (args: MessageArgsProps) => Promise<boolean>;
  destroy: (key?: React.Key) => void;
}

export const UIMessage: UIMessageAPI = message as unknown as UIMessageAPI;

export function useUIMessage() {
  return message.useMessage();
}

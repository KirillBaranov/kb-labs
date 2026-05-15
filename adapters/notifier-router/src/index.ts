/**
 * @module @kb-labs/notifier-router
 * Notification router — INotifier implementation that fans out to INotifierChannel via EventBus.
 */

export { NotifierImpl, NOTIFICATION_TOPIC, DELIVERY_SUCCESS_TOPIC, DELIVERY_FAILED_TOPIC } from './notifier-impl.js';
export { createAdapter, createNotifierAdapter } from './factory.js';
export type { NotifierImplOptions } from './notifier-impl.js';
export type { NotifierRouterDeps } from './types.js';
